/**
 * Installed-apps registry tests: strict manifest validation, upsert
 * semantics, and the provider install/uninstall flows against an in-memory
 * fake provider (no network, no server).
 * Run: bun test tests/apps-registry.test.ts
 */
import { describe, test, expect } from "bun:test";
import {
  validateAppsManifest,
  validateInstalledApp,
  parseAppsJson,
  upsertApp,
  installAppInProvider,
  uninstallAppFromProvider,
  appsFromList,
  defaultAppsManifest,
  APPS_VERSION,
  APK_FOLDER_NAME,
  type InstalledApp,
} from "@/lib/apps-registry";
import type { StorageProvider, StorageItem, QuotaInfo, UploadOptions } from "@/lib/storage/types";
import type { ApkInfo } from "@/lib/apk";

/* ---------- in-memory fake provider ---------- */

interface FakeFile extends StorageItem {
  content?: Blob;
  parentId?: string;
}

class FakeProvider implements StorageProvider {
  readonly kind = "local" as const;
  readonly rootId = "root";
  items = new Map<string, FakeFile>();
  private seq = 0;
  removed: string[] = [];

  constructor() {
    this.items.set("root", {
      id: "root",
      name: "",
      mimeType: "application/vnd.google-apps.folder",
      isFolder: true,
      size: 0,
      modifiedTime: new Date().toISOString(),
    });
  }

  private nextId(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  async list(folderId: string): Promise<StorageItem[]> {
    return [...this.items.values()].filter((i) => i.id !== "root" && i.parentId === folderId);
  }

  async upload(parentId: string, file: File | Blob, opts?: UploadOptions): Promise<StorageItem> {
    const name = opts?.name ?? (file instanceof File ? file.name : "blob");
    const item: FakeFile = {
      id: this.nextId("f"),
      parentId,
      name,
      mimeType: file.type || "application/octet-stream",
      isFolder: false,
      size: file.size,
      modifiedTime: new Date().toISOString(),
      content: file,
    };
    this.items.set(item.id, item);
    opts?.onProgress?.(file.size, file.size);
    return { ...item };
  }

  async download(id: string): Promise<Blob> {
    const f = this.items.get(id);
    if (!f || f.isFolder) throw new Error("not found");
    return f.content ?? new Blob([""]);
  }

  async createFolder(parentId: string, name: string): Promise<StorageItem> {
    const item: FakeFile = {
      id: this.nextId("d"),
      parentId,
      name,
      mimeType: "application/vnd.google-apps.folder",
      isFolder: true,
      size: 0,
      modifiedTime: new Date().toISOString(),
    };
    this.items.set(item.id, item);
    return { ...item };
  }

  async remove(id: string): Promise<void> {
    this.removed.push(id);
    this.items.delete(id);
  }

  async rename(id: string, name: string): Promise<void> {
    const f = this.items.get(id);
    if (f) f.name = name;
  }

  async updateContent(id: string, content: string): Promise<void> {
    const f = this.items.get(id);
    if (!f) throw new Error("not found");
    f.content = new Blob([content], { type: "application/json" });
    f.size = content.length;
  }

  async quota(): Promise<QuotaInfo> {
    return { usage: 0, limit: 256 * 1024 ** 3, label: "Fake" };
  }

  mediaUrl(): string | null {
    return null;
  }

  /** helper for assertions */
  findByName(name: string): FakeFile | undefined {
    return [...this.items.values()].find((i) => i.name === name);
  }
}

/* ---------- fixtures ---------- */

const APK_INFO: ApkInfo = {
  packageName: "fr.neamar.kiss",
  label: "KISS launcher",
  versionName: "3.26.0",
  versionCode: 224,
  minSdk: 21,
  targetSdk: 36,
  permissions: ["android.permission.READ_CONTACTS"],
  iconDataUrl: "data:image/png;base64,iVBORw0KGgo=",
};

function makeApp(overrides: Partial<InstalledApp> = {}): InstalledApp {
  return {
    packageName: "com.example.app",
    label: "Example",
    versionName: "1.0",
    versionCode: 1,
    iconDataUrl: null,
    apkFileId: "f-1",
    apkFileName: "example.apk",
    sizeBytes: 1234,
    permissions: [],
    minSdk: 21,
    targetSdk: 33,
    installedAt: 1700000000000,
    ...overrides,
  };
}

/* ---------- manifest validation ---------- */

describe("validateAppsManifest / parseAppsJson", () => {
  test("accepts an empty manifest", () => {
    expect(validateAppsManifest({ version: APPS_VERSION, apps: [] })).toEqual({
      version: APPS_VERSION,
      apps: [],
    });
  });

  test("accepts valid entries and normalizes empty icon to null", () => {
    const m = validateAppsManifest({ version: 1, apps: [makeApp({ iconDataUrl: "" })] });
    expect(m).not.toBeNull();
    expect(m!.apps[0].iconDataUrl).toBeNull();
  });

  test("rejects wrong version, non-arrays, oversized lists", () => {
    expect(validateAppsManifest({ version: 2, apps: [] })).toBeNull();
    expect(validateAppsManifest({ version: 1, apps: "nope" })).toBeNull();
    const tooMany = { version: 1, apps: Array.from({ length: 201 }, (_, i) => makeApp({ packageName: `p${i}` })) };
    expect(validateAppsManifest(tooMany)).toBeNull();
  });

  test("rejects duplicate package names", () => {
    const dup = { version: 1, apps: [makeApp(), makeApp()] };
    expect(validateAppsManifest(dup)).toBeNull();
  });

  test("rejects entries with bad fields", () => {
    expect(validateInstalledApp(makeApp({ versionCode: -1 }))).toBeNull();
    expect(validateInstalledApp(makeApp({ apkFileId: "" }))).toBeNull();
    expect(validateInstalledApp(makeApp({ iconDataUrl: "http://evil" }))).toBeNull();
    expect(validateInstalledApp(makeApp({ permissions: [42] }))).toBeNull();
    expect(validateInstalledApp(makeApp({ installedAt: "now" }))).toBeNull();
    expect(validateInstalledApp(null)).toBeNull();
  });

  test("parseAppsJson flags corrupted JSON", () => {
    expect(parseAppsJson("not json").corrupted).toBe(true);
    expect(parseAppsJson('{"version":1,"apps":[]}').corrupted).toBe(false);
  });
});

describe("upsertApp", () => {
  test("adds new packages and replaces same-package entries (upgrade)", () => {
    let apps: InstalledApp[] = [];
    apps = upsertApp(apps, makeApp({ packageName: "a", versionCode: 1 }));
    apps = upsertApp(apps, makeApp({ packageName: "b", versionCode: 5 }));
    expect(apps.map((a) => a.packageName)).toEqual(["a", "b"]);

    apps = upsertApp(apps, makeApp({ packageName: "a", versionCode: 2, label: "A2" }));
    expect(apps.length).toBe(2);
    const a = apps.find((x) => x.packageName === "a")!;
    expect(a.versionCode).toBe(2);
    expect(a.label).toBe("A2");
  });
});

/* ---------- provider install / uninstall flows ---------- */

describe("installAppInProvider (fake provider)", () => {
  test("uploads the APK into an APKs folder it creates", async () => {
    const provider = new FakeProvider();
    const blob = new Blob([new Uint8Array(1024)], { type: "application/vnd.android.package-archive" });
    const { app, uploaded } = await installAppInProvider(provider, {
      blob,
      fileName: "kiss.apk",
      info: APK_INFO,
    });

    expect(uploaded).toBe(true);
    expect(app.packageName).toBe("fr.neamar.kiss");
    expect(app.sizeBytes).toBe(1024);
    expect(app.apkFileName).toBe("kiss.apk");
    expect(app.iconDataUrl).toBe(APK_INFO.iconDataUrl);

    const folder = provider.findByName(APK_FOLDER_NAME);
    expect(folder).toBeDefined();
    expect(folder!.isFolder).toBe(true);
    const apkFile = provider.findByName("kiss.apk");
    expect(apkFile).toBeDefined();
    expect(apkFile!.parentId).toBe(folder!.id);
    // MIME preserved
    expect(apkFile!.mimeType).toBe("application/vnd.android.package-archive");
  });

  test("reuses an existing APKs folder on second install", async () => {
    const provider = new FakeProvider();
    const opts = () => ({
      blob: new Blob([new Uint8Array(10)]),
      fileName: "x.apk",
      info: { ...APK_INFO, packageName: "com.x" },
    });
    await installAppInProvider(provider, opts());
    await installAppInProvider(provider, opts());
    const folders = [...provider.items.values()].filter((i) => i.name === APK_FOLDER_NAME);
    expect(folders.length).toBe(1);
  });

  test("existingFileId skips the upload (install from Files)", async () => {
    const provider = new FakeProvider();
    const { app, uploaded } = await installAppInProvider(provider, {
      blob: new Blob([new Uint8Array(32)]),
      fileName: "already-there.apk",
      info: APK_INFO,
      existingFileId: "f-99",
    });
    expect(uploaded).toBe(false);
    expect(app.apkFileId).toBe("f-99");
    expect(provider.findByName("already-there.apk")).toBeUndefined();
  });

  test("reports upload progress", async () => {
    const provider = new FakeProvider();
    let reported: Array<[number, number]> = [];
    await installAppInProvider(provider, {
      blob: new Blob([new Uint8Array(64)]),
      fileName: "p.apk",
      info: APK_INFO,
      onProgress: (l, t) => reported.push([l, t]),
    });
    expect(reported.length).toBeGreaterThan(0);
    expect(reported[reported.length - 1]).toEqual([64, 64]);
  });
});

describe("uninstallAppFromProvider (fake provider)", () => {
  test("removes the registry entry; deletes the APK only when asked", async () => {
    const provider = new FakeProvider();
    const blob = new Blob([new Uint8Array(16)]);
    const { app } = await installAppInProvider(provider, { blob, fileName: "k.apk", info: APK_INFO });
    const apps = [app];

    const afterKeep = await uninstallAppFromProvider(provider, apps, app.packageName, false);
    expect(afterKeep.length).toBe(0);
    expect(provider.removed.length).toBe(0);

    const afterDelete = await uninstallAppFromProvider(provider, apps, app.packageName, true);
    expect(afterDelete.length).toBe(0);
    expect(provider.removed).toContain(app.apkFileId);
  });

  test("unknown package is a no-op that still yields a list", async () => {
    const provider = new FakeProvider();
    const next = await uninstallAppFromProvider(provider, [], "ghost.pkg", true);
    expect(next).toEqual([]);
  });
});

describe("appsFromList / defaultAppsManifest", () => {
  test("produces a manifest that round-trips through validation", () => {
    const manifest = appsFromList([makeApp()]);
    expect(validateAppsManifest(manifest)).not.toBeNull();
    expect(defaultAppsManifest()).toEqual({ version: 1, apps: [] });
  });
});
