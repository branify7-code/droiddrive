/**
 * Regression tests for the APK manager account-switch / stale-response fixes:
 *
 * 1. installApk must NEVER report success when the app-list manifest cannot be
 *    saved — it reverts the optimistic entry and rethrows.
 * 2. installApk must cancel (and clean up the orphan blob) when the storage
 *    account changes while the APK is still uploading.
 * 3. hydrateApps must discard responses that resolve after an account switch,
 *    and must never leave the previous account's list visible on load errors.
 * 4. uninstallApp must rethrow manifest-save failures and revert the list.
 * 5. Local identity changes (sign-in/sign-out) bump the account generation.
 *
 * All storage is mocked — no live Google Drive is touched.
 * Run: bun test tests/apps-stale-response.test.ts
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { usePhone, accountGen, bumpAccountGen } from "@/lib/phone-store";
import type { StorageItem, StorageProvider } from "@/lib/storage/types";
import { APPS_FILE_NAME, type InstalledApp } from "@/lib/apps-registry";
import type { ApkInfo } from "@/lib/apk";

const realGetProvider = usePhone.getState().getProvider;
const originalFetch = globalThis.fetch;

const APK_INFO: ApkInfo = {
  packageName: "com.example.app",
  label: "Example App",
  versionName: "1.2.3",
  versionCode: 123,
  minSdk: 21,
  targetSdk: 34,
  permissions: ["android.permission.INTERNET"],
  iconDataUrl: null,
};

const INSTALLED: InstalledApp = {
  packageName: APK_INFO.packageName,
  label: APK_INFO.label,
  versionName: APK_INFO.versionName,
  versionCode: APK_INFO.versionCode,
  iconDataUrl: null,
  apkFileId: "apk-existing",
  apkFileName: "existing.apk",
  sizeBytes: 1000,
  permissions: APK_INFO.permissions,
  minSdk: 21,
  targetSdk: 34,
  installedAt: 1700000000000,
};

function item(partial: Partial<StorageItem>): StorageItem {
  return {
    id: "id",
    name: "file",
    mimeType: "application/octet-stream",
    isFolder: false,
    size: 0,
    modifiedTime: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

/** Mock provider with call recording; behaviors overridable per test. */
function makeMockProvider(over: {
  list?: StorageProvider["list"];
  upload?: StorageProvider["upload"];
  updateContent?: StorageProvider["updateContent"];
  remove?: StorageProvider["remove"];
}) {
  const calls = { remove: [] as string[], updateContent: [] as string[] };
  const apksFolder = item({ id: "folder-apks", name: "APKs", isFolder: true, mimeType: "application/folder" });
  const apkFile = item({ id: "apk-file-1", name: "app.apk", mimeType: "application/vnd.android.package-archive", size: 4321 });
  const provider = {
    kind: "drive" as const,
    rootId: "root",
    list: over.list ?? (async () => [apksFolder]),
    upload: over.upload ?? (async () => apkFile),
    download: async () => new Blob(["{}"], { type: "application/json" }),
    createFolder: async () => apksFolder,
    remove: over.remove ?? (async (id: string) => void calls.remove.push(id)),
    rename: async () => {},
    updateContent:
      over.updateContent ?? (async (id: string) => void calls.updateContent.push(id)),
    quota: async () => ({ usage: 0, limit: null, label: "0 B of unlimited", unlimited: true }),
    mediaUrl: () => null,
  } as unknown as StorageProvider;
  return { provider, calls, apksFolder, apkFile };
}

function setDriveMode(provider: StorageProvider) {
  usePhone.setState({
    storageMode: "drive",
    driveToken: "tok",
    driveExpiry: Date.now() + 60_000,
    driveRootId: "root",
    appsReady: false,
    appsCorrupted: false,
    installedApps: [],
    getProvider: () => provider,
  });
}

async function flush(times = 3) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  usePhone.setState({
    storageMode: "local",
    driveToken: null,
    driveExpiry: 0,
    driveRootId: null,
    driveEmail: null,
    driveSessionExpired: false,
    localAuthNeeded: false,
    appsReady: false,
    appsCorrupted: false,
    installedApps: [],
    appInfoFor: null,
    getProvider: realGetProvider,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("installApk — save failures must not report success", () => {
  test("manifest save failure reverts the optimistic entry and RETHROWS", async () => {
    const { provider } = makeMockProvider({
      // APK blob upload succeeds; the manifest save (no file yet -> upload with
      // name=APPS_FILE_NAME) fails.
      upload: async (_parentId, _blob, opts) => {
        if (opts && "name" in opts && (opts as { name?: string }).name === APPS_FILE_NAME) {
          throw new Error("Drive quota exceeded");
        }
        return item({ id: "apk-file-1", name: "app.apk", size: 4321 });
      },
    });
    setDriveMode(provider);

    let thrown: Error | null = null;
    try {
      await usePhone.getState().installApk({
        blob: new Blob(["APKBYTES"]),
        fileName: "app.apk",
        info: APK_INFO,
      });
    } catch (e) {
      thrown = e instanceof Error ? e : new Error(String(e));
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain("quota exceeded");
    // The optimistic entry was reverted — the app is NOT reported installed.
    expect(usePhone.getState().installedApps).toEqual([]);
  });

  test("save failure does NOT delete the freshly uploaded APK blob (kept for retry/inspection)", async () => {
    const removed: string[] = [];
    const { provider } = makeMockProvider({
      upload: async (_parentId, _blob, opts) => {
        if (opts && "name" in opts && (opts as { name?: string }).name === APPS_FILE_NAME) {
          throw new Error("network gone");
        }
        return item({ id: "apk-file-1", name: "app.apk", size: 4321 });
      },
      remove: async (id: string) => void removed.push(id),
    });
    setDriveMode(provider);
    try {
      await usePhone.getState().installApk({
        blob: new Blob(["APKBYTES"]),
        fileName: "app.apk",
        info: APK_INFO,
      });
      expect.unreachable();
    } catch {
      /* expected */
    }
    expect(removed).toEqual([]);
  });

  test("existing-file installs (from Files) revert cleanly on save failure", async () => {
    const { provider } = makeMockProvider({
      // Manifest exists -> save path uses updateContent, which fails.
      list: async () => [item({ id: "apps-json", name: APPS_FILE_NAME, mimeType: "application/json" })],
      updateContent: async () => {
        throw new Error("410 gone");
      },
    });
    setDriveMode(provider);
    usePhone.setState({ installedApps: [INSTALLED] });

    let thrown: Error | null = null;
    try {
      await usePhone.getState().installApk({
        blob: new Blob(["APKBYTES"]),
        fileName: "existing.apk",
        info: APK_INFO,
        existingFileId: "apk-existing",
      });
    } catch (e) {
      thrown = e instanceof Error ? e : new Error(String(e));
    }
    expect(thrown?.message).toContain("410 gone");
    // Upsert replaced the entry optimistically; the failure reverted it.
    expect(usePhone.getState().installedApps).toEqual([INSTALLED]);
  });
});

describe("installApk — account switch mid-upload", () => {
  test("cancels, removes the orphan blob from the OLD account, and throws", async () => {
    let releaseUpload!: (v: StorageItem) => void;
    const uploadGate = new Promise<StorageItem>((res) => (releaseUpload = res));
    const removed: string[] = [];
    const { provider } = makeMockProvider({
      upload: () => uploadGate,
      remove: async (id: string) => void removed.push(id),
    });
    setDriveMode(provider);

    const pending = usePhone.getState().installApk({
      blob: new Blob(["APKBYTES"]),
      fileName: "app.apk",
      info: APK_INFO,
    });
    await flush(); // let it reach the hanging upload
    const genBefore = accountGen();
    bumpAccountGen(); // user switched accounts while the upload was in flight
    releaseUpload(item({ id: "apk-file-1", name: "app.apk", size: 4321 }));

    let message = "";
    try {
      await pending;
      expect.unreachable();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(accountGen()).toBeGreaterThan(genBefore);
    expect(message).toContain("cancelled");
    expect(removed).toEqual(["apk-file-1"]); // orphan cleaned from the old account
    expect(usePhone.getState().installedApps).toEqual([]); // nothing reported installed
  });
});

describe("hydrateApps — stale responses and load errors", () => {
  /** Fetch stub whose response BODIES are released manually, in call order. */
  function hangFetch() {
    const pending: ((body: string) => void)[] = [];
    globalThis.fetch = (async () => {
      const body = await new Promise<string>((resolve) => pending.push(resolve));
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    return pending;
  }

  test("a response that resolves AFTER an account switch is discarded", async () => {
    usePhone.setState({
      storageMode: "drive",
      driveToken: "tok",
      driveExpiry: Date.now() + 60_000,
      driveRootId: "root",
      appsReady: false,
      installedApps: [],
    });
    const pending = hangFetch();
    const hydration = usePhone.getState().hydrateApps();
    await flush();
    const staleGen = accountGen();
    bumpAccountGen(); // account switched while the manifest was being fetched

    pending[0](
      JSON.stringify({ files: [{ id: "apps-json", name: APPS_FILE_NAME, mimeType: "application/json" }] })
    );
    await flush(5); // list resolves -> download fetch is issued
    expect(pending.length).toBe(2); // second fetch = manifest download
    const manifest = { version: 1, apps: [INSTALLED] };
    pending[1](JSON.stringify(manifest)); // OLD account's app list arrives late
    await flush(5);
    await hydration;

    expect(accountGen()).toBeGreaterThan(staleGen);
    expect(usePhone.getState().installedApps).toEqual([]); // stale list NOT applied
    expect(usePhone.getState().appsReady).toBe(false); // hydration for the NEW account is still pending
  });

  test("a load error clears a previous account's list instead of bleeding it across accounts", async () => {
    usePhone.setState({
      storageMode: "drive",
      driveToken: "tok",
      driveExpiry: Date.now() + 60_000,
      driveRootId: "root",
      appsReady: true,
      installedApps: [INSTALLED], // previous account's list still displayed
    });
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await usePhone.getState().hydrateApps();

    const s = usePhone.getState();
    expect(s.installedApps).toEqual([]); // previous account's apps never shown under the new one
    expect(s.appsReady).toBe(true); // the phone is never blocked on the registry
  });
});

describe("uninstallApp — save failures and stale responses", () => {
  test("manifest save failure reverts the removal and RETHROWS", async () => {
    const { provider } = makeMockProvider({
      list: async () => [item({ id: "apps-json", name: APPS_FILE_NAME, mimeType: "application/json" })],
      updateContent: async () => {
        throw new Error("save failed");
      },
    });
    setDriveMode(provider);
    usePhone.setState({ installedApps: [INSTALLED] });

    let message = "";
    try {
      await usePhone.getState().uninstallApp(APK_INFO.packageName, false);
      expect.unreachable();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("save failed");
    expect(usePhone.getState().installedApps).toEqual([INSTALLED]); // reverted
  });

  test("mid-flight account switch persists the removal to the OLD account only", async () => {
    let releaseRemove!: () => void;
    const removeGate = new Promise<void>((res) => (releaseRemove = res));
    const removed: string[] = [];
    let savedToOldAccount = false;
    const { provider } = makeMockProvider({
      list: async () => [item({ id: "apps-json", name: APPS_FILE_NAME, mimeType: "application/json" })],
      remove: async (id: string) => {
        removed.push(id);
        await removeGate;
      },
      updateContent: async () => {
        savedToOldAccount = true;
      },
    });
    setDriveMode(provider);
    usePhone.setState({ installedApps: [INSTALLED] });

    const pending = usePhone.getState().uninstallApp(APK_INFO.packageName, true);
    await flush(); // let it reach the hanging blob removal
    bumpAccountGen(); // switch while the removal is in flight
    releaseRemove();
    await pending; // resolves without touching the new account's state

    expect(removed).toEqual(["apk-existing"]); // blob was removed from the OLD account
    expect(savedToOldAccount).toBe(true); // old manifest stays consistent with the removed blob
    expect(usePhone.getState().installedApps).toEqual([INSTALLED]); // current state untouched
  });
});

describe("local identity changes bump the account generation", () => {
  test("localSignOut bumps accountGen and resets the installed-apps state", async () => {
    usePhone.setState({ installedApps: [INSTALLED], appsReady: true });
    const before = accountGen();
    await usePhone.getState().localSignOut();
    expect(accountGen()).toBeGreaterThan(before);
    expect(usePhone.getState().installedApps).toEqual([]);
    expect(usePhone.getState().appsReady).toBe(false);
  });

  test("localAuthResolved bumps accountGen and resets the installed-apps state", () => {
    usePhone.setState({ installedApps: [INSTALLED], appsReady: true, localAuthNeeded: true });
    const before = accountGen();
    usePhone.getState().localAuthResolved("alice", 0);
    expect(accountGen()).toBeGreaterThan(before);
    expect(usePhone.getState().installedApps).toEqual([]);
    expect(usePhone.getState().localUser).toBe("alice");
  });
});
