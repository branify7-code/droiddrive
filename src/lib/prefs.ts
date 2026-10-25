import type { StorageProvider, StorageItem } from "@/lib/storage/types";

/**
 * Phone preference persistence.
 *
 * Drive mode: a versioned JSON file ("droiddrive-settings.json") inside the
 * PhoneStorage root — restores on reconnect and on any other browser signed
 * into the same Drive account.
 *
 * Local mode: the same JSON shape in localStorage (server-local storage is
 * per-machine by definition).
 *
 * Corrupted files are NEVER silently overwritten: loads report `corrupted`
 * and auto-save is suspended until the user explicitly resets the file
 * (which archives the original first).
 */

export const PREFS_FILE_NAME = "droiddrive-settings.json";
export const PREFS_VERSION = 1;

export interface PhonePrefs {
  version: number;
  brightness: number; // 20..100
  toggles: { wifi: boolean; bt: boolean; dnd: boolean; airplane: boolean };
}

export interface PrefsLoadResult {
  prefs: PhonePrefs | null;
  found: boolean;
  corrupted: boolean;
}

export function defaultPrefs(): PhonePrefs {
  return {
    version: PREFS_VERSION,
    brightness: 100,
    toggles: { wifi: true, bt: false, dnd: false, airplane: false },
  };
}

/** Strict validation: exact version, bounded brightness, all-boolean toggles. */
export function validatePrefs(raw: unknown): PhonePrefs | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== PREFS_VERSION) return null;
  const b = o.brightness;
  if (typeof b !== "number" || !Number.isInteger(b) || b < 20 || b > 100) return null;
  const t = o.toggles;
  if (t == null || typeof t !== "object" || Array.isArray(t)) return null;
  const tv = t as Record<string, unknown>;
  if (typeof tv.wifi !== "boolean") return null;
  if (typeof tv.bt !== "boolean") return null;
  if (typeof tv.dnd !== "boolean") return null;
  if (typeof tv.airplane !== "boolean") return null;
  const wifi: boolean = tv.wifi;
  const bt: boolean = tv.bt;
  const dnd: boolean = tv.dnd;
  const airplane: boolean = tv.airplane;
  return {
    version: PREFS_VERSION,
    brightness: b,
    toggles: { wifi, bt, dnd, airplane },
  };
}

export function parsePrefsJson(text: string): { prefs: PhonePrefs | null; corrupted: boolean } {
  try {
    const prefs = validatePrefs(JSON.parse(text));
    return { prefs, corrupted: prefs === null };
  } catch {
    return { prefs: null, corrupted: true };
  }
}

/* ---------- Drive (provider-based) ---------- */

function findFile(items: StorageItem[], name: string): StorageItem | null {
  return items.find((i) => !i.isFolder && i.name === name) ?? null;
}

export async function loadPrefsFromProvider(
  provider: StorageProvider
): Promise<PrefsLoadResult> {
  const items = await provider.list(provider.rootId);
  const file = findFile(items, PREFS_FILE_NAME);
  if (!file) return { prefs: null, found: false, corrupted: false };
  const blob = await provider.download(file.id);
  const text = await blob.text();
  const { prefs, corrupted } = parsePrefsJson(text);
  return { prefs, found: true, corrupted };
}

export async function savePrefsToProvider(provider: StorageProvider, prefs: PhonePrefs): Promise<void> {
  const items = await provider.list(provider.rootId);
  const file = findFile(items, PREFS_FILE_NAME);
  const json = JSON.stringify(prefs, null, 2);
  if (file) {
    await provider.updateContent(file.id, json);
  } else {
    await provider.upload(provider.rootId, new Blob([json], { type: "application/json" }), {
      name: PREFS_FILE_NAME,
    });
  }
}

/* ---------- Local (localStorage-based) ---------- */

const LOCAL_PREFS_KEY = "droiddrive.prefs.v1";

export function loadLocalPrefs(): PrefsLoadResult {
  if (typeof window === "undefined") return { prefs: null, found: false, corrupted: false };
  const raw = window.localStorage.getItem(LOCAL_PREFS_KEY);
  if (raw == null) return { prefs: null, found: false, corrupted: false };
  const { prefs, corrupted } = parsePrefsJson(raw);
  return { prefs, found: true, corrupted };
}

export function saveLocalPrefs(prefs: PhonePrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs, null, 2));
}

/** Remove the local prefs entry (used when it is corrupted beyond use). */
export function clearLocalPrefs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_PREFS_KEY);
}
