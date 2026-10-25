import type { StorageProvider, StorageItem } from "@/lib/storage/types";
import { APK_MIME, MAX_PERMISSIONS } from "@/lib/apk";
import type { ApkInfo } from "@/lib/apk";

/**
 * Installed-app registry for DroidDrive's APK manager.
 *
 * Persistence mirrors phone prefs:
 * - Drive mode: versioned JSON ("droiddrive-installed-apps.json") in the
 *   PhoneStorage root — follows the Drive account across browsers.
 * - Local mode: the same JSON shape in localStorage.
 *
 * APK blobs themselves are stored like any phone file:
 * - install from Files: the existing file is referenced (no duplicate upload)
 * - install from Play Store: the APK is uploaded into the "/APKs" folder
 *
 * Honest scope: installed apps are managed (icon, metadata, uninstall), but
 * their code never executes — there is no Android runtime in a browser.
 */

export const APPS_FILE_NAME = "droiddrive-installed-apps.json";
export const APPS_VERSION = 1;
export const APK_FOLDER_NAME = "APKs";
export const MAX_APPS = 200;

export interface InstalledApp {
  packageName: string;
  label: string;
  versionName: string;
  versionCode: number;
  iconDataUrl: string | null;
  /** Provider file id of the stored APK blob. */
  apkFileId: string;
  apkFileName: string;
  sizeBytes: number;
  permissions: string[];
  minSdk: number | null;
  targetSdk: number | null;
  installedAt: number;
}

export interface AppsManifest {
  version: number;
  apps: InstalledApp[];
}

export interface AppsLoadResult {
  manifest: AppsManifest | null;
  found: boolean;
  corrupted: boolean;
}

export function defaultAppsManifest(): AppsManifest {
  return { version: APPS_VERSION, apps: [] };
}

function validIcon(v: unknown): v is string | null {
  return v == null || (typeof v === "string" && (v === "" || v.startsWith("data:image/")));
}

function validOptInt(v: unknown): v is number | null {
  return v == null || (typeof v === "number" && Number.isFinite(v));
}

/** Strict validation of one installed-app entry. */
export function validateInstalledApp(raw: unknown): InstalledApp | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.packageName !== "string" || !o.packageName.trim() || o.packageName.length > 200) return null;
  if (typeof o.label !== "string" || o.label.length > 300) return null;
  if (typeof o.versionName !== "string" || o.versionName.length > 100) return null;
  if (typeof o.versionCode !== "number" || !Number.isFinite(o.versionCode) || o.versionCode < 0) return null;
  if (typeof o.apkFileId !== "string" || !o.apkFileId.trim()) return null;
  if (typeof o.apkFileName !== "string" || !o.apkFileName.trim() || o.apkFileName.length > 300) return null;
  if (typeof o.sizeBytes !== "number" || !Number.isFinite(o.sizeBytes) || o.sizeBytes < 0) return null;
  if (!Array.isArray(o.permissions) || o.permissions.some((p) => typeof p !== "string")) return null;
  if (o.permissions.length > MAX_PERMISSIONS) return null;
  if (!validIcon(o.iconDataUrl)) return null;
  if (!validOptInt(o.minSdk) || !validOptInt(o.targetSdk)) return null;
  if (typeof o.installedAt !== "number" || !Number.isFinite(o.installedAt)) return null;
  return {
    packageName: o.packageName.trim(),
    label: o.label,
    versionName: o.versionName,
    versionCode: o.versionCode,
    iconDataUrl: o.iconDataUrl || null,
    apkFileId: o.apkFileId,
    apkFileName: o.apkFileName,
    sizeBytes: o.sizeBytes,
    permissions: o.permissions,
    minSdk: o.minSdk ?? null,
    targetSdk: o.targetSdk ?? null,
    installedAt: o.installedAt,
  };
}

export function validateAppsManifest(raw: unknown): AppsManifest | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== APPS_VERSION) return null;
  if (!Array.isArray(o.apps) || o.apps.length > MAX_APPS) return null;
  const apps: InstalledApp[] = [];
  const seen = new Set<string>();
  for (const item of o.apps) {
    const app = validateInstalledApp(item);
    if (!app) return null;
    if (seen.has(app.packageName)) return null; // duplicate package = corrupt
    seen.add(app.packageName);
    apps.push(app);
  }
  return { version: APPS_VERSION, apps };
}

export function parseAppsJson(text: string): { manifest: AppsManifest | null; corrupted: boolean } {
  try {
    const manifest = validateAppsManifest(JSON.parse(text));
    return { manifest, corrupted: manifest === null };
  } catch {
    return { manifest: null, corrupted: true };
  }
}

/** Insert or replace by packageName (reinstall = upgrade/replacement). */
export function upsertApp(apps: InstalledApp[], app: InstalledApp): InstalledApp[] {
  const idx = apps.findIndex((a) => a.packageName === app.packageName);
  if (idx === -1) return [...apps, app];
  const next = apps.slice();
  next[idx] = app;
  return next;
}

/* ---------- provider (Drive or local server) persistence ---------- */

function findFile(items: StorageItem[], name: string): StorageItem | null {
  return items.find((i) => !i.isFolder && i.name === name) ?? null;
}

export async function loadAppsFromProvider(provider: StorageProvider): Promise<AppsLoadResult> {
  const items = await provider.list(provider.rootId);
  const file = findFile(items, APPS_FILE_NAME);
  if (!file) return { manifest: null, found: false, corrupted: false };
  const blob = await provider.download(file.id);
  const text = await blob.text();
  const { manifest, corrupted } = parseAppsJson(text);
  return { manifest, found: true, corrupted };
}

export async function saveAppsToProvider(provider: StorageProvider, manifest: AppsManifest): Promise<void> {
  const items = await provider.list(provider.rootId);
  const file = findFile(items, APPS_FILE_NAME);
  const json = JSON.stringify(manifest, null, 2);
  if (file) {
    await provider.updateContent(file.id, json);
  } else {
    await provider.upload(provider.rootId, new Blob([json], { type: "application/json" }), {
      name: APPS_FILE_NAME,
    });
  }
}

export interface InstallOptions {
  blob: Blob;
  fileName: string;
  info: ApkInfo;
  /** When installing from Files, reference the existing file instead of re-uploading. */
  existingFileId?: string;
  onProgress?: (loaded: number, total: number) => void;
}

export interface InstallOutcome {
  app: InstalledApp;
  /** True when the APK blob was newly uploaded (not an existing Files item). */
  uploaded: boolean;
}

/**
 * Store the APK blob (if needed) and register metadata. Throws on storage
 * errors — callers must surface them (never silently fake success).
 */
export async function installAppInProvider(
  provider: StorageProvider,
  opts: InstallOptions
): Promise<InstallOutcome> {
  const { blob, fileName, info, existingFileId, onProgress } = opts;

  let apkFileId = existingFileId ?? "";
  let uploaded = false;
  if (!apkFileId) {
    // find-or-create the APKs folder at the storage root
    const rootItems = await provider.list(provider.rootId);
    let folder = rootItems.find((i) => i.isFolder && i.name === APK_FOLDER_NAME);
    if (!folder) {
      const created = await provider.createFolder(provider.rootId, APK_FOLDER_NAME);
      folder = { ...created, isFolder: true };
    }
    const stored = await provider.upload(folder.id, blob, {
      name: fileName,
      onProgress,
    });
    apkFileId = stored.id;
    uploaded = true;
  }

  const app: InstalledApp = {
    packageName: info.packageName,
    label: info.label,
    versionName: info.versionName,
    versionCode: info.versionCode,
    iconDataUrl: info.iconDataUrl,
    apkFileId,
    apkFileName: fileName,
    sizeBytes: blob.size,
    permissions: info.permissions,
    minSdk: info.minSdk,
    targetSdk: info.targetSdk,
    installedAt: Date.now(),
  };
  return { app, uploaded };
}

/** Remove an app from the manifest; optionally delete the APK blob (best effort). */
export async function uninstallAppFromProvider(
  provider: StorageProvider,
  apps: InstalledApp[],
  packageName: string,
  alsoDeleteApk: boolean
): Promise<InstalledApp[]> {
  const app = apps.find((a) => a.packageName === packageName);
  const next = apps.filter((a) => a.packageName !== packageName);
  if (app && alsoDeleteApk && app.apkFileId) {
    try {
      await provider.remove(app.apkFileId);
    } catch {
      /* blob delete is best-effort — the registry entry is still removed */
    }
  }
  return next;
}

/** Persist after install/uninstall; used by the store (errors surface to UI). */
export function appsFromList(apps: InstalledApp[]): AppsManifest {
  return { version: APPS_VERSION, apps };
}

/* ---------- local (localStorage-based) ---------- */

const LOCAL_APPS_KEY = "droiddrive.apps.v1";

export function loadLocalApps(): AppsLoadResult {
  if (typeof window === "undefined") return { manifest: null, found: false, corrupted: false };
  const raw = window.localStorage.getItem(LOCAL_APPS_KEY);
  if (raw == null) return { manifest: null, found: false, corrupted: false };
  const { manifest, corrupted } = parseAppsJson(raw);
  return { manifest, found: true, corrupted };
}

export function saveLocalApps(manifest: AppsManifest): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_APPS_KEY, JSON.stringify(manifest, null, 2));
}

export function clearLocalApps(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_APPS_KEY);
}

export { APK_MIME };
