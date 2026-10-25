/**
 * APK parsing for DroidDrive.
 *
 * Real functionality: an .apk file is a ZIP containing AndroidManifest.xml
 * (Android binary XML) + resources.arsc. "app-info-parser" decodes both, and
 * this module normalizes its output into a small, validated `ApkInfo`.
 *
 * Honest scope: parsing and file management are real. APK *code* cannot be
 * executed here — there is no Android runtime (ART/Dalvik) in a browser.
 */

export interface ApkInfo {
  packageName: string;
  label: string;
  versionName: string;
  versionCode: number;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: string[];
  iconDataUrl: string | null;
}

/** Launcher icons larger than this are downscaled (or dropped) before persisting. */
export const MAX_ICON_DATAURL_LEN = 80_000;
/** Hard cap for the permissions list persisted per app. */
export const MAX_PERMISSIONS = 100;

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** application.label may be a plain string or an array of localized strings. */
function pickLabel(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return "";
}

function pickPermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    let name: unknown = item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      name = (item as Record<string, unknown>).name;
    }
    if (typeof name === "string" && name.trim()) {
      out.push(name.trim());
      if (out.length >= MAX_PERMISSIONS) break;
    }
  }
  return out;
}

/**
 * Downscale an oversized launcher icon in the browser. Outside a browser
 * (tests / SSR) oversized icons are dropped rather than persisted bloated.
 */
export async function normalizeIcon(dataUrl: unknown): Promise<string | null> {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  if (dataUrl.length > 2_000_000) return null; // absurd — refuse
  if (dataUrl.length <= MAX_ICON_DATAURL_LEN) return dataUrl;
  if (typeof document === "undefined") return null;
  try {
    const img = document.createElement("img");
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("icon decode failed"));
      img.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // contain-fit
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const out = canvas.toDataURL("image/png");
    return out.length <= 200_000 ? out : null;
  } catch {
    return null;
  }
}

/** Normalize a raw app-info-parser result. Returns null when no package name exists. */
export function normalizeApkParse(raw: unknown): ApkInfo | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const packageName = typeof o.package === "string" && o.package.trim() ? o.package.trim() : null;
  if (!packageName) return null;
  const app = (o.application ?? null) as Record<string, unknown> | null;

  const sdk = (o.usesSdk ?? null) as Record<string, unknown> | null;
  const icon = typeof o.icon === "string" ? o.icon : null;

  return {
    packageName,
    label: pickLabel(app?.label) || packageName,
    versionName: typeof o.versionName === "string" ? o.versionName : String(o.versionName ?? ""),
    versionCode: toNum(o.versionCode) ?? 0,
    minSdk: toNum(sdk?.minSdkVersion),
    targetSdk: toNum(sdk?.targetSdkVersion),
    permissions: pickPermissions(o.usesPermissions),
    iconDataUrl: icon, // possibly oversized — normalizeIcon() fixes it in parseApkSource
  };
}

/**
 * Parse APK metadata.
 *
 * - Browser: pass the picked File/Blob (a .apk name is required by the lib).
 * - Node/bun tests: pass an absolute file path string.
 *
 * Icon normalization is async (possible canvas downscale), so is the parse.
 */
export async function parseApkSource(source: File | Blob | string): Promise<ApkInfo> {
  const mod = (await import("app-info-parser")) as unknown as {
    default: new (s: File | Blob | string) => { parse(): Promise<unknown> };
  };
  const AppInfoParser = mod.default ?? (mod as unknown as new (s: File | Blob | string) => { parse(): Promise<unknown> });

  let src: File | Blob | string = source;
  if (typeof src !== "string" && typeof File !== "undefined") {
    // The lib requires a .apk extension on the file name (browser mode).
    if (!(src instanceof File)) {
      src = new File([src], "app.apk", { type: "application/vnd.android.package-archive" });
    } else if (!/\.apk$/i.test(src.name)) {
      src = new File([src], `${src.name || "app"}.apk`, { type: src.type || "application/vnd.android.package-archive" });
    }
  }

  const raw = await new AppInfoParser(src).parse();
  const info = normalizeApkParse(raw);
  if (!info) {
    throw new Error("Not a valid APK — AndroidManifest.xml is missing or unreadable");
  }
  info.iconDataUrl = await normalizeIcon(info.iconDataUrl);
  return info;
}

/** Browser helper: parse a picked/dropped blob under a given file name. */
export async function parseApkBlob(blob: Blob, fileName: string): Promise<ApkInfo> {
  if (typeof File === "undefined") throw new Error("APK parsing requires a browser runtime");
  const safeName = /\.apk$/i.test(fileName) ? fileName : `${fileName || "app"}.apk`;
  const file = blob instanceof File ? blob : new File([blob], safeName, { type: "application/vnd.android.package-archive" });
  return parseApkSource(file);
}

export const APK_MIME = "application/vnd.android.package-archive";
