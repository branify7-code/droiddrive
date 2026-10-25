"use client";

import { create } from "zustand";
import { LocalProvider } from "@/lib/storage/local";
import {
  DriveProvider,
  requestDriveToken,
  resolveDriveRoot,
  fetchDriveAbout,
} from "@/lib/storage/drive";
import type { StorageProvider } from "@/lib/storage/types";
import { formatBytes } from "@/lib/format";

const CLIENT_ID_KEY = "droiddrive_client_id";

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
  driveToken: string | null;
  driveExpiry: number;
  driveRootId: string | null;
  driveEmail: string | null;
  driveConnecting: boolean;

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
  disconnectDrive: () => void;
  refreshDriveQuota: () => Promise<void>;
  driveQuota: { usage: number; limit: number } | null;
  setDriveClientId: (id: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

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
  driveClientId: "",
  driveToken: null,
  driveExpiry: 0,
  driveRootId: null,
  driveEmail: null,
  driveConnecting: false,
  driveQuota: null,

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
  setBrightness: (v) => set({ brightness: Math.max(20, Math.min(100, v)) }),
  toggleSwitch: (k) => set((s) => ({ toggles: { ...s.toggles, [k]: !s.toggles[k] } })),

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

  getProvider: () => {
    const s = get();
    if (s.storageMode === "drive" && s.driveToken && s.driveRootId && s.isDriveTokenValid()) {
      return new DriveProvider(s.driveToken, s.driveRootId);
    }
    return new LocalProvider();
  },

  setDriveClientId: (id) => {
    set({ driveClientId: id });
    if (id) localStorage.setItem(CLIENT_ID_KEY, id);
    else localStorage.removeItem(CLIENT_ID_KEY);
  },

  connectDrive: async (clientIdInput) => {
    const cid = (clientIdInput ?? get().driveClientId ?? "").trim();
    if (!cid) throw new Error("Enter your Google OAuth Client ID first");
    set({ driveConnecting: true });
    try {
      // Interactive flow (account chooser / consent)
      const { token, expiry } = await requestDriveToken(cid);
      const about = await fetchDriveAbout(token);
      const rootId = await resolveDriveRoot(token);
      set({
        storageMode: "drive",
        driveClientId: cid,
        driveToken: token,
        driveExpiry: expiry,
        driveRootId: rootId,
        driveEmail: about.email,
        driveQuota: about.quota,
      });
      localStorage.setItem(CLIENT_ID_KEY, cid);
      get().showToast(`Google Drive connected - ${formatBytes(about.quota.limit)} of cloud storage`);
    } finally {
      set({ driveConnecting: false });
    }
  },

  trySilentReconnect: async () => {
    const s = get();
    if (s.storageMode === "drive" && s.isDriveTokenValid()) return;
    const cid = s.driveClientId || localStorage.getItem(CLIENT_ID_KEY) || "";
    if (!cid) return;
    set({ driveConnecting: true });
    try {
      // Silent attempt: no popup, works if the user already granted consent
      const { token, expiry } = await requestDriveToken(cid, "");
      const about = await fetchDriveAbout(token);
      const rootId = await resolveDriveRoot(token);
      set({
        storageMode: "drive",
        driveClientId: cid,
        driveToken: token,
        driveExpiry: expiry,
        driveRootId: rootId,
        driveEmail: about.email,
        driveQuota: about.quota,
      });
    } catch {
      // Silent reconnect failed — stay in local mode until user connects manually
    } finally {
      set({ driveConnecting: false });
    }
  },

  disconnectDrive: () => {
    set({
      storageMode: "local",
      driveToken: null,
      driveExpiry: 0,
      driveRootId: null,
      driveEmail: null,
      driveQuota: null,
    });
    get().showToast("Switched to local virtual storage");
  },

  refreshDriveQuota: async () => {
    const s = get();
    if (s.storageMode !== "drive" || !s.driveToken) return;
    const about = await fetchDriveAbout(s.driveToken);
    set({ driveQuota: about.quota });
  },
}));

/* Initial hydration of stored client id */
if (typeof window !== "undefined") {
  const stored = localStorage.getItem(CLIENT_ID_KEY);
  if (stored) usePhone.setState({ driveClientId: stored });
}
