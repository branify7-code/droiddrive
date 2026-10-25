"use client";

import { create } from "zustand";
import { LocalProvider, setLocalAuthHandler } from "@/lib/storage/local";
import {
  DriveProvider,
  requestDriveToken,
  resolveDriveRoot,
  fetchDriveAbout,
  setDriveSessionExpiredHandler,
} from "@/lib/storage/drive";
import type { StorageProvider, QuotaInfo } from "@/lib/storage/types";
import { DriveSessionExpiredError } from "@/lib/storage/types";
import { formatBytes } from "@/lib/format";
import {
  loadPrefsFromProvider,
  savePrefsToProvider,
  loadLocalPrefs,
  saveLocalPrefs,
  clearLocalPrefs,
  PREFS_FILE_NAME,
  type PhonePrefs,
} from "@/lib/prefs";
import {
  loadAppsFromProvider,
  saveAppsToProvider,
  loadLocalApps,
  saveLocalApps,
  clearLocalApps,
  installAppInProvider,
  uninstallAppFromProvider,
  appsFromList,
  APPS_FILE_NAME,
  defaultAppsManifest,
  type InstalledApp,
} from "@/lib/apps-registry";
import type { ApkInfo } from "@/lib/apk";

const CLIENT_ID_KEY = "droiddrive_client_id";
/**
 * Set once a Drive session has been successfully established in this browser.
 * Boot-time silent reconnect only runs when this exists — without it, GIS may
 * hijack the page with a full-window Google sign-in redirect on first visit
 * (popup-less environments fall back to top-level navigation).
 */
const DRIVE_CONNECTED_FLAG = "droiddrive.drive.connected";

function markDriveConnected(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRIVE_CONNECTED_FLAG, "1");
  } catch {
    /* storage unavailable */
  }
}

function hadDriveSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DRIVE_CONNECTED_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * The user's Google OAuth Client ID (a PUBLIC identifier — safe to embed).
 * Provided 2026-10-25 for project "droiddrive". The OAuth client secret is
 * NOT used anywhere in this app and must never be committed.
 */
export const DEFAULT_DRIVE_CLIENT_ID =
  "457622455310-1gahsvld0o70km0mm80ipn3iavuhpt6g.apps.googleusercontent.com";

/**
 * Monotonic counter bumped whenever the storage account/context changes
 * (Drive connect, disconnect, account switch). Async work captures the value
 * at start and MUST discard its result if the counter moved on — this
 * prevents a previous account's responses from updating the current UI.
 */
let accountGeneration = 0;
export const accountGen = () => accountGeneration;
export const bumpAccountGen = () => ++accountGeneration;

function persistClientId(id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(CLIENT_ID_KEY, id);
    else window.localStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    /* storage unavailable */
  }
}

export interface DriveQuotaState {
  usage: number;
  usageInDrive?: number;
  limit: number;
  unlimited?: boolean;
}

interface PhoneState {
  /* --- system UI --- */
  booting: boolean;
  locked: boolean;
  activeApp: string | null;
  recents: string[];
  drawerOpen: boolean;
  shadeOpen: boolean;
  recentsOpen: boolean;
  brightness: number; // 20..100
  toggles: { wifi: boolean; bt: boolean; dnd: boolean; airplane: boolean };
  toast: { id: number; msg: string } | null;

  /* --- storage --- */
  storageMode: "local" | "drive";
  driveClientId: string;
  /** OAuth access token — memory only, never persisted. */
  driveToken: string | null;
  driveExpiry: number;
  driveRootId: string | null;
  driveEmail: string | null;
  driveConnecting: boolean;
  /** True when Drive mode is active but the token is missing/expired/revoked. */
  driveSessionExpired: boolean;
  driveQuota: QuotaInfo | null;

  /** Set when the local API answered 401 — shows the sign-in dialog. */
  localAuthNeeded: boolean;
  /** Signed-in local server account username (or null). */
  localUser: string | null;
  /** Bumped after local auth changes so apps refetch. */
  storageEpoch: number;

  /* --- preferences persistence --- */
  /** True once saved prefs have been loaded/applied; auto-save waits for this. */
  prefsReady: boolean;
  /** True when the saved prefs JSON failed validation (auto-save suspended). */
  prefsCorrupted: boolean;

  /* --- installed apps (APK manager) --- */
  installedApps: InstalledApp[];
  appsReady: boolean;
  /** True when the saved apps JSON failed validation (auto-save suspended). */
  appsCorrupted: boolean;
  /** packageName of the installed app whose info dialog is open (or null). */
  appInfoFor: string | null;

  /* --- actions --- */
  finishBoot: () => void;
  lock: () => void;
  unlock: () => void;
  openApp: (id: string) => void;
  closeApp: () => void;
  back: () => void;
  goHome: () => void;
  removeRecent: (id: string) => void;
  clearRecents: () => void;
  setDrawerOpen: (v: boolean) => void;
  setShadeOpen: (v: boolean) => void;
  setRecentsOpen: (v: boolean) => void;
  setBrightness: (v: number) => void;
  toggleSwitch: (k: "wifi" | "bt" | "dnd" | "airplane") => void;
  showToast: (msg: string) => void;
  dismissToast: () => void;

  /* --- storage actions --- */
  getProvider: () => StorageProvider;
  isDriveTokenValid: () => boolean;
  connectDrive: (clientId?: string) => Promise<void>;
  trySilentReconnect: () => Promise<void>;
  /** Explicit user action: abandon the Drive session and use local storage. */
  disconnectDrive: () => void;
  refreshDriveQuota: () => Promise<void>;
  setDriveClientId: (id: string) => void;
  markLocalAuthNeeded: () => void;
  localAuthResolved: (username: string, adoptedFiles?: number) => void;
  localSignOut: () => Promise<void>;
  setLocalUser: (username: string | null) => void;

  /* --- preferences actions --- */
  hydratePrefs: () => Promise<void>;
  savePrefsSoon: () => void;
  resetCorruptedPrefs: () => Promise<void>;

  /* --- installed apps (APK manager) actions --- */
  hydrateApps: () => Promise<void>;
  installApk: (opts: {
    blob: Blob;
    fileName: string;
    info: ApkInfo;
    existingFileId?: string;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<InstalledApp>;
  uninstallApp: (packageName: string, alsoDeleteApk: boolean) => Promise<void>;
  resetCorruptedApps: () => Promise<void>;
  setAppInfoFor: (packageName: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let prefsTimer: ReturnType<typeof setTimeout> | null = null;

function prefsFromState(s: { brightness: number; toggles: PhoneState["toggles"] }): PhonePrefs {
  return { version: 1, brightness: s.brightness, toggles: { ...s.toggles } };
}

export const usePhone = create<PhoneState>((set, get) => ({
  booting: true,
  locked: true,
  activeApp: null,
  recents: [],
  drawerOpen: false,
  shadeOpen: false,
  recentsOpen: false,
  brightness: 100,
  toggles: { wifi: true, bt: false, dnd: false, airplane: false },
  toast: null,

  storageMode: "local",
  driveClientId: DEFAULT_DRIVE_CLIENT_ID,
  driveToken: null,
  driveExpiry: 0,
  driveRootId: null,
  driveEmail: null,
  driveConnecting: false,
  driveSessionExpired: false,
  driveQuota: null,

  localAuthNeeded: false,
  localUser: null,
  storageEpoch: 0,

  prefsReady: false,
  prefsCorrupted: false,

  installedApps: [],
  appsReady: false,
  appsCorrupted: false,
  appInfoFor: null,

  finishBoot: () => set({ booting: false }),
  lock: () => set({ locked: true, activeApp: null, drawerOpen: false, shadeOpen: false, recentsOpen: false }),
  unlock: () => set({ locked: false }),
  openApp: (id) =>
    set((s) => ({
      activeApp: id,
      drawerOpen: false,
      shadeOpen: false,
      recentsOpen: false,
      recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, 8),
    })),
  closeApp: () => set({ activeApp: null, drawerOpen: false }),
  goHome: () => set({ activeApp: null, drawerOpen: false, shadeOpen: false, recentsOpen: false }),
  back: () => {
    const s = get();
    if (s.shadeOpen) return set({ shadeOpen: false });
    if (s.recentsOpen) return set({ recentsOpen: false });
    if (s.drawerOpen) return set({ drawerOpen: false });
    if (s.activeApp) return set({ activeApp: null });
  },
  removeRecent: (id) =>
    set((s) => {
      const recents = s.recents.filter((r) => r !== id);
      const activeApp = s.activeApp === id && !recents.includes(id) ? null : s.activeApp;
      return { recents, activeApp };
    }),
  clearRecents: () => set({ recents: [], recentsOpen: false, activeApp: null }),

  setDrawerOpen: (v) => set({ drawerOpen: v, shadeOpen: false, recentsOpen: false }),
  setShadeOpen: (v) => set({ shadeOpen: v, drawerOpen: false, recentsOpen: false }),
  setRecentsOpen: (v) => set({ recentsOpen: v, drawerOpen: false, shadeOpen: false }),
  setAppInfoFor: (packageName) => set({ appInfoFor: packageName }),

  setBrightness: (v) => {
    set({ brightness: Math.max(20, Math.min(100, v)) });
    get().savePrefsSoon();
  },
  toggleSwitch: (k) => {
    set((s) => ({ toggles: { ...s.toggles, [k]: !s.toggles[k] } }));
    get().savePrefsSoon();
  },

  showToast: (msg) => {
    if (toastTimer) clearTimeout(toastTimer);
    const id = Date.now();
    set({ toast: { id, msg } });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  isDriveTokenValid: () => {
    const { driveToken, driveExpiry } = get();
    return !!driveToken && Date.now() < driveExpiry;
  },

  /**
   * Returns the active provider. In Drive mode this NEVER falls back to
   * local storage: if the token is missing/expired it flags the session as
   * expired and throws — the UI shows the reconnect message and the user
   * must reconnect or explicitly switch to local storage in Settings.
   */
  getProvider: () => {
    const s = get();
    if (s.storageMode === "drive") {
      if (s.driveToken && s.driveRootId && Date.now() < s.driveExpiry) {
        return new DriveProvider(s.driveToken, s.driveRootId);
      }
      set({ driveSessionExpired: true });
      throw new DriveSessionExpiredError();
    }
    return new LocalProvider();
  },

  setDriveClientId: (id) => {
    set({ driveClientId: id });
    persistClientId(id);
  },

  connectDrive: async (clientIdInput) => {
    const cid = (clientIdInput ?? get().driveClientId ?? "").trim() || DEFAULT_DRIVE_CLIENT_ID;
    if (!cid) throw new Error("Enter your Google OAuth Client ID first");
    set({ driveConnecting: true });
    try {
      // Interactive flow (account chooser / consent)
      const { token, expiry } = await requestDriveToken(cid);
      const about = await fetchDriveAbout(token);
      const rootId = await resolveDriveRoot(token);
      bumpAccountGen();
      set({
        storageMode: "drive",
        driveClientId: cid,
        driveToken: token,
        driveExpiry: expiry,
        driveRootId: rootId,
        driveEmail: about.email,
        driveQuota: about.quota,
        driveSessionExpired: false,
        prefsReady: false,
        prefsCorrupted: false,
      });
      persistClientId(cid);
      markDriveConnected();
      const q = about.quota;
      get().showToast(
        q.unlimited
          ? `Google Drive connected - ${about.email}`
          : `Google Drive connected - ${formatBytes(q.limit)} of cloud storage`
      );
      void get().hydratePrefs();
    } finally {
      set({ driveConnecting: false });
    }
  },

  trySilentReconnect: async () => {
    const s = get();
    if (s.storageMode === "drive" && s.isDriveTokenValid()) return;
    const cid = s.driveClientId || (typeof window !== "undefined" ? window.localStorage.getItem(CLIENT_ID_KEY) : "") || DEFAULT_DRIVE_CLIENT_ID;
    // Boot-time safety: only touch GIS if this browser connected before.
    // A first visit must never fire a token request — in popup-less
    // environments GIS redirects the WHOLE page to accounts.google.com.
    if (!hadDriveSession()) return;
    if (!cid) return;
    set({ driveConnecting: true });
    try {
      // Silent attempt: no popup, works if the user already granted consent
      const { token, expiry } = await requestDriveToken(cid, "");
      const about = await fetchDriveAbout(token);
      const rootId = await resolveDriveRoot(token);
      bumpAccountGen();
      set({
        storageMode: "drive",
        driveClientId: cid,
        driveToken: token,
        driveExpiry: expiry,
        driveRootId: rootId,
        driveEmail: about.email,
        driveQuota: about.quota,
        driveSessionExpired: false,
        prefsReady: false,
        prefsCorrupted: false,
      });
      markDriveConnected();
      void get().hydratePrefs();
    } catch {
      // Silent reconnect failed — stay in local mode until the user connects manually
    } finally {
      set({ driveConnecting: false });
    }
  },

  /**
   * Explicit switch away from Drive (Settings button). Clears ALL
   * account-specific state: token, root, email, quota, expiry flag — and
   * bumps the account generation so in-flight requests from the old account
   * are discarded by the UI.
   */
  disconnectDrive: () => {
    bumpAccountGen();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(DRIVE_CONNECTED_FLAG);
      } catch {
        /* ignore */
      }
    }
    set({
      storageMode: "local",
      driveToken: null,
      driveExpiry: 0,
      driveRootId: null,
      driveEmail: null,
      driveQuota: null,
      driveSessionExpired: false,
      prefsReady: false,
      prefsCorrupted: false,
    });
    get().showToast("Switched to local virtual storage");
    void get().hydratePrefs();
  },

  refreshDriveQuota: async () => {
    const s = get();
    if (s.storageMode !== "drive" || !s.driveToken) return;
    const about = await fetchDriveAbout(s.driveToken);
    set({ driveQuota: about.quota });
  },

  markLocalAuthNeeded: () => set({ localAuthNeeded: true }),

  localAuthResolved: (username, adoptedFiles) => {
    set((s) => ({
      localUser: username,
      localAuthNeeded: false,
      storageEpoch: s.storageEpoch + 1,
    }));
    get().showToast(
      adoptedFiles && adoptedFiles > 0
        ? `Signed in as ${username} - adopted ${adoptedFiles} existing file${adoptedFiles === 1 ? "" : "s"}`
        : `Signed in as ${username}`
    );
  },

  localSignOut: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore network errors on sign-out */
    }
    set((s) => ({ localUser: null, storageEpoch: s.storageEpoch + 1 }));
    get().showToast("Signed out of local storage");
  },

  setLocalUser: (username) => set({ localUser: username }),

  hydratePrefs: async () => {
    const s = get();
    // Installed-app registry hydrates in lockstep with prefs (same triggers:
    // boot, Drive connect, silent reconnect, switch to local).
    void get().hydrateApps();
    try {
      if (s.storageMode === "drive") {
        if (!s.driveToken || !s.driveRootId) {
          set({ prefsReady: true });
          return;
        }
        const provider = new DriveProvider(s.driveToken, s.driveRootId);
        const r = await loadPrefsFromProvider(provider);
        if (r.corrupted) {
          set({ prefsCorrupted: true, prefsReady: true });
          get().showToast("Saved settings file is corrupted - using defaults (original kept)");
          return;
        }
        set({ prefsCorrupted: false });
        if (r.prefs) {
          set({ brightness: r.prefs.brightness, toggles: { ...r.prefs.toggles } });
        }
        set({ prefsReady: true });
      } else {
        const r = loadLocalPrefs();
        if (r.corrupted) {
          set({ prefsCorrupted: true, prefsReady: true });
          get().showToast("Saved settings are corrupted - using defaults (original kept)");
          return;
        }
        set({ prefsCorrupted: false });
        if (r.prefs) {
          set({ brightness: r.prefs.brightness, toggles: { ...r.prefs.toggles } });
        }
        set({ prefsReady: true });
      }
    } catch {
      // Preferences are non-critical — never block the phone on them.
      set({ prefsReady: true });
    }
  },

  savePrefsSoon: () => {
    const s = get();
    if (!s.prefsReady || s.prefsCorrupted) return;
    if (prefsTimer) clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
      const cur = get();
      if (!cur.prefsReady || cur.prefsCorrupted) return;
      const prefs = prefsFromState(cur);
      try {
        if (cur.storageMode === "drive") {
          if (!cur.driveToken || !cur.driveRootId || Date.now() >= cur.driveExpiry) return;
          const provider = new DriveProvider(cur.driveToken, cur.driveRootId);
          void savePrefsToProvider(provider, prefs).catch(() => {
            /* quota/network errors — retried on next change */
          });
        } else {
          saveLocalPrefs(prefs);
        }
      } catch {
        /* ignore */
      }
    }, 900);
  },

  /**
   * User-initiated recovery from a corrupted settings file.
   * Drive mode: archives the corrupt file under a new name FIRST, then
   * writes a fresh file — the original content is never silently lost.
   * Local mode: removes the corrupt localStorage entry (value already
   * unreadable) and re-enables auto-save.
   */
  resetCorruptedPrefs: async () => {
    const s = get();
    try {
      if (s.storageMode === "drive") {
        if (!s.driveToken || !s.driveRootId) return;
        const provider = new DriveProvider(s.driveToken, s.driveRootId);
        const items = await provider.list(provider.rootId);
        const file = items.find((i) => !i.isFolder && i.name === PREFS_FILE_NAME);
        if (file) {
          try {
            const raw = await (await provider.download(file.id)).text();
            const backupName = PREFS_FILE_NAME.replace(/\.json$/, "") + `.corrupt-${Date.now()}.json`;
            await provider.upload(
              provider.rootId,
              new Blob([raw], { type: "application/json" }),
              { name: backupName }
            );
          } catch {
            /* archive best-effort; still refuse to overwrite if it fails */
            get().showToast("Could not archive the corrupted file - nothing was overwritten");
            return;
          }
          await savePrefsToProvider(provider, prefsFromState(get()));
        }
        set({ prefsCorrupted: false, prefsReady: true });
        get().showToast("Corrupted settings archived and replaced");
      } else {
        clearLocalPrefs();
        set({ prefsCorrupted: false, prefsReady: true });
        get().showToast("Corrupted settings cleared - using current values");
      }
    } catch (e) {
      get().showToast(e instanceof Error ? e.message : "Could not reset settings");
    }
  },

  /* ---------- installed apps (APK manager) ---------- */

  hydrateApps: async () => {
    const s = get();
    try {
      if (s.storageMode === "drive") {
        if (!s.driveToken || !s.driveRootId) {
          set({ appsReady: true });
          return;
        }
        const provider = new DriveProvider(s.driveToken, s.driveRootId);
        const r = await loadAppsFromProvider(provider);
        if (r.corrupted) {
          set({ appsCorrupted: true, appsReady: true, installedApps: [] });
          get().showToast("Installed-apps file is corrupted - app list cleared (original kept)");
          return;
        }
        set({
          appsCorrupted: false,
          appsReady: true,
          installedApps: r.manifest ? r.manifest.apps : [],
        });
      } else {
        const r = loadLocalApps();
        if (r.corrupted) {
          set({ appsCorrupted: true, appsReady: true, installedApps: [] });
          get().showToast("Saved app list is corrupted - apps cleared (original kept)");
          return;
        }
        set({
          appsCorrupted: false,
          appsReady: true,
          installedApps: r.manifest ? r.manifest.apps : [],
        });
      }
    } catch {
      // App registry is non-critical — never block the phone on it.
      set({ appsReady: true });
    }
  },

  installApk: async (opts) => {
    const s = get();
    const provider = s.getProvider();
    const { app } = await installAppInProvider(provider, opts);
    const next = upsertLocal(s.installedApps, app);
    set({ installedApps: next });
    try {
      await persistApps(get, provider, next);
    } catch (e) {
      get().showToast(
        e instanceof Error ? e.message : "App installed, but the app list could not be saved"
      );
    }
    return app;
  },

  uninstallApp: async (packageName, alsoDeleteApk) => {
    const s = get();
    const provider = s.getProvider();
    const next = await uninstallAppFromProvider(provider, s.installedApps, packageName, alsoDeleteApk);
    set({ installedApps: next, appInfoFor: s.appInfoFor === packageName ? null : s.appInfoFor });
    try {
      await persistApps(get, provider, next);
    } catch (e) {
      get().showToast(
        e instanceof Error ? e.message : "App removed, but the app list could not be saved"
      );
    }
  },

  /**
   * User-initiated recovery from a corrupted installed-apps file.
   * Drive mode archives the corrupt file first (never silently lost).
   */
  resetCorruptedApps: async () => {
    const s = get();
    try {
      if (s.storageMode === "drive") {
        if (!s.driveToken || !s.driveRootId) return;
        const provider = new DriveProvider(s.driveToken, s.driveRootId);
        const items = await provider.list(provider.rootId);
        const file = items.find((i) => !i.isFolder && i.name === APPS_FILE_NAME);
        if (file) {
          try {
            const raw = await (await provider.download(file.id)).text();
            const backupName = APPS_FILE_NAME.replace(/\.json$/, "") + `.corrupt-${Date.now()}.json`;
            await provider.upload(
              provider.rootId,
              new Blob([raw], { type: "application/json" }),
              { name: backupName }
            );
          } catch {
            get().showToast("Could not archive the corrupted file - nothing was overwritten");
            return;
          }
          await saveAppsToProvider(provider, defaultAppsManifest());
        }
        set({ appsCorrupted: false, appsReady: true, installedApps: [] });
        get().showToast("Corrupted app list archived and replaced");
      } else {
        clearLocalApps();
        set({ appsCorrupted: false, appsReady: true, installedApps: [] });
        get().showToast("Corrupted app list cleared - starting fresh");
      }
    } catch (e) {
      get().showToast(e instanceof Error ? e.message : "Could not reset app list");
    }
  },
}));

/* ---------- installed-apps helpers ---------- */

function upsertLocal(apps: InstalledApp[], app: InstalledApp): InstalledApp[] {
  const idx = apps.findIndex((a) => a.packageName === app.packageName);
  if (idx === -1) return [...apps, app];
  const next = apps.slice();
  next[idx] = app;
  return next;
}

async function persistApps(
  get: () => PhoneState,
  provider: StorageProvider,
  apps: InstalledApp[]
): Promise<void> {
  const cur = get();
  if (cur.appsCorrupted) return; // suspended like prefs auto-save
  const manifest = appsFromList(apps);
  if (cur.storageMode === "drive") {
    await saveAppsToProvider(provider, manifest);
  } else {
    saveLocalApps(manifest);
  }
}

/* ---------- global handlers wired to providers ---------- */

if (typeof window !== "undefined") {
  // Drive 401 anywhere (fetch or XHR upload) flags the expired session.
  setDriveSessionExpiredHandler(() => {
    if (usePhone.getState().storageMode === "drive") {
      usePhone.setState({ driveSessionExpired: true });
    }
  });
  // Local API 401 opens the local sign-in dialog.
  setLocalAuthHandler(() => {
    usePhone.setState({ localAuthNeeded: true });
  });
}

/* ---------- preferences helpers used by the store ---------- */

/* Initial hydration of stored client id (client id is a public identifier) */
if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(CLIENT_ID_KEY);
    if (stored) usePhone.setState({ driveClientId: stored });
  } catch {
    /* storage unavailable */
  }
}
