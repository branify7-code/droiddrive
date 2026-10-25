import { StorageItem, QuotaInfo, StorageProvider, UploadOptions, StorageError } from "./types";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const PHONE_ROOT_FOLDER = "PhoneStorage";
/** Google Drive files.list maximum page size. */
export const DRIVE_PAGE_SIZE = 1000;
/** Intentional traversal cap for recursive discovery (Photos/Music). */
export const WALK_MAX_DEPTH = 6;

/* ---------- Google Identity Services (GIS) OAuth ---------- */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;

export function loadGsi(): Promise<void> {
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gsiPromise = null;
        reject(new Error("Failed to load Google Identity Services (check network)"));
      };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

/**
 * Request an OAuth access token for Google Drive.
 * prompt="" attempts a silent refresh (no UI). Omit prompt for the interactive chooser.
 *
 * Access tokens are returned to the caller and kept in memory only — they are
 * never written to localStorage or any persistent store.
 */
export function requestDriveToken(
  clientId: string,
  prompt?: string
): Promise<{ token: string; expiry: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      await loadGsi();
      const tc = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        ...(prompt !== undefined ? { prompt } : {}),
        callback: (resp) => {
          if (resp.access_token) {
            resolve({
              token: resp.access_token,
              expiry: Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000,
            });
          } else {
            reject(new StorageError(resp.error || "Authorization failed"));
          }
        },
        error_callback: (err) =>
          reject(
            new StorageError(
              err.message || err.type || "Authorization was interrupted"
            )
          ),
      });
      tc.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
}

/* ---------- Drive REST helpers ---------- */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/**
 * Fetch wrapper for the Drive REST API.
 * `pathOrUrl` may be an API path ("/files?...") — prefixed with the standard
 * Drive API origin — or an ABSOLUTE url (e.g. an upload-session URL on the
 * separate googleapis.com/upload origin), which is used verbatim.
 */
async function driveFetch(token: string, pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    driveExpiredHandler?.();
    throw new StorageError("Google Drive session expired — reconnect to continue.", 401);
  }
  return res;
}

type DriveExpiredHandler = () => void;
let driveExpiredHandler: DriveExpiredHandler | null = null;

/** Register a callback fired whenever Drive answers 401 (session expired). */
export function setDriveSessionExpiredHandler(fn: DriveExpiredHandler | null) {
  driveExpiredHandler = fn;
}

interface DriveFileResource {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
}

function toItem(f: DriveFileResource): StorageItem {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
    size: f.size ? Number(f.size) : 0,
    modifiedTime: f.modifiedTime ?? new Date().toISOString(),
    thumbnailUrl: f.hasThumbnail && f.thumbnailLink ? f.thumbnailLink : null,
  };
}

/* ---------- quota parsing (exported for tests) ---------- */

export interface RawStorageQuota {
  limit?: string | number;
  usage?: string | number;
  usageInDrive?: string | number;
  usageInDriveTrash?: string | number;
}

/**
 * Map Google's about.storageQuota onto our QuotaInfo:
 * - `usage` is the TOTAL account usage (all Google products),
 * - `usageInDrive` is Drive-only usage,
 * - available space must be computed as limit - usage (account-wide),
 * - a missing/zero limit means "no reported limit" (never shown as 0 capacity).
 */
export function parseDriveQuota(sq: RawStorageQuota | undefined | null): QuotaInfo {
  const q = sq ?? {};
  const rawLimit = q.limit == null ? 0 : Number(q.limit);
  const unlimited = !Number.isFinite(rawLimit) || rawLimit <= 0;
  const usage = Number.isFinite(Number(q.usage)) ? Number(q.usage) : 0;
  const usageInDrive = Number.isFinite(Number(q.usageInDrive)) ? Number(q.usageInDrive) : usage;
  return {
    usage,
    usageInDrive,
    limit: unlimited ? 0 : rawLimit,
    unlimited,
    label: "Google Drive",
  };
}

/**
 * DriveProvider — uses the user's real Google Drive (their plan quota) as the
 * phone's storage. All phone content lives inside a "PhoneStorage" folder in
 * the Drive root to keep things tidy.
 */
export class DriveProvider implements StorageProvider {
  readonly kind = "drive" as const;
  rootId: string;

  constructor(
    private token: string,
    rootId: string
  ) {
    this.rootId = rootId;
  }

  getToken() {
    return this.token;
  }

  /** List a folder, following nextPageToken until every page is read. */
  async list(folderId: string): Promise<StorageItem[]> {
    const items: StorageItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        pageSize: String(DRIVE_PAGE_SIZE),
        orderBy: "folder,name",
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,hasThumbnail,thumbnailLink)",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await driveFetch(this.token, `/files?${params.toString()}`);
      if (!res.ok) throw new StorageError("Failed to list Drive files", res.status);
      const data = await res.json();
      items.push(...((data.files ?? []) as DriveFileResource[]).map(toItem));
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
    } while (pageToken);
    return items;
  }

  /**
   * Resumable upload via XHR so we get progress events; works for any file size.
   * NOTE: if the upload is interrupted the session is NOT resumed — the caller
   * simply restarts the upload. Success is only reported when Google returns
   * a 2xx response with the created file resource.
   */
  upload(parentId: string, file: File | Blob, opts?: UploadOptions): Promise<StorageItem> {
    const name = opts?.name ?? (file instanceof File ? file.name : "file");
    // Preserve the Blob's own MIME type (camera JPEGs, text notes, JSON…);
    // only fall back to octet-stream when the type is genuinely unknown.
    const mime = (file instanceof File ? file.type : file.type) || "application/octet-stream";
    const token = this.token;

    const initiate = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime`
        );
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        xhr.setRequestHeader("X-Upload-Content-Type", mime);
        xhr.setRequestHeader("X-Upload-Content-Length", String(file.size));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const loc = xhr.getResponseHeader("Location") || xhr.getResponseHeader("location");
            if (loc) resolve(loc);
            else reject(new Error("Drive did not return an upload session URL"));
          } else if (xhr.status === 401 || xhr.status === 403) {
            driveExpiredHandler?.();
            reject(new StorageError("Google Drive session expired — reconnect to continue.", xhr.status));
          } else {
            reject(new StorageError(`Drive upload failed (${xhr.status})`, xhr.status));
          }
        };
        xhr.onerror = () => reject(new Error("Drive upload failed (network error)"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
        xhr.send(
          JSON.stringify({
            name,
            parents: [parentId],
            mimeType: mime,
          })
        );
      });

    return new Promise<StorageItem>((resolve, reject) => {
      (async () => {
        try {
          const sessionUrl = await initiate();
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", sessionUrl);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) opts?.onProgress?.(e.loaded, e.total);
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(toItem(JSON.parse(xhr.responseText) as DriveFileResource));
              } catch {
                reject(new Error("Bad Drive response"));
              }
            } else if (xhr.status === 401 || xhr.status === 403) {
              driveExpiredHandler?.();
              reject(new StorageError("Google Drive session expired — reconnect to continue.", xhr.status));
            } else {
              reject(new Error(`Drive upload failed (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error("Drive upload failed (network error)"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));
          if (opts?.signal) {
            opts.signal.addEventListener(
              "abort",
              () => {
                xhr.abort();
              },
              { once: true }
            );
          }
          xhr.send(file);
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  async download(id: string): Promise<Blob> {
    const res = await driveFetch(this.token, `/files/${id}?alt=media`);
    if (!res.ok) throw new StorageError("Failed to download from Drive", res.status);
    return res.blob();
  }

  async createFolder(parentId: string, name: string): Promise<StorageItem> {
    const res = await driveFetch(this.token, `/files?fields=id,name,mimeType,modifiedTime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });
    if (!res.ok) throw new StorageError("Failed to create folder in Drive", res.status);
    return toItem(await res.json());
  }

  /** Move to Drive trash (recoverable at drive.google.com). */
  async remove(id: string): Promise<void> {
    const res = await driveFetch(this.token, `/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
    if (!res.ok) throw new StorageError("Failed to delete from Drive", res.status);
  }

  async rename(id: string, name: string): Promise<void> {
    const res = await driveFetch(this.token, `/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new StorageError("Failed to rename", res.status);
  }

  /**
   * Overwrite a file's content in place via the MEDIA UPLOAD endpoint
   * (googleapis.com/upload/...). The absolute upload URL is passed through
   * driveFetch verbatim — it must NOT be prefixed with the plain API origin.
   */
  async updateContent(id: string, content: string): Promise<void> {
    const res = await driveFetch(
      this.token,
      `${UPLOAD_API}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,name,mimeType,size`,
      { method: "PATCH", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: content }
    );
    if (!res.ok) throw new StorageError("Failed to save to Drive", res.status);
  }

  /** Real quota values from about.get — account-wide usage plus Drive-only usage. */
  async quota(): Promise<QuotaInfo> {
    const res = await driveFetch(this.token, `/about?fields=storageQuota`);
    if (!res.ok) throw new StorageError("Failed to read Drive quota", res.status);
    const data = await res.json();
    return parseDriveQuota(data.storageQuota);
  }

  mediaUrl(): string | null {
    return null;
  }
}

/** Find (or create) the "PhoneStorage" folder in the Drive root. */
export async function resolveDriveRoot(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${PHONE_ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`
  );
  const res = await fetch(
    `${API}/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=${DRIVE_PAGE_SIZE}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.ok) {
    const data = await res.json();
    if (data.files?.length) return data.files[0].id as string;
  }
  const create = await fetch(`${API}/files?fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: PHONE_ROOT_FOLDER,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });
  if (!create.ok) throw new StorageError("Could not create PhoneStorage folder in Drive", create.status);
  const made = await create.json();
  return made.id as string;
}

/** Fetch Drive account info (email + real quota values) with a fresh token. */
export async function fetchDriveAbout(token: string): Promise<{
  email: string;
  quota: QuotaInfo;
}> {
  const res = await fetch(`${API}/about?fields=user,storageQuota`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new StorageError("Failed to read Drive account info", res.status);
  const data = await res.json();
  return {
    email: data.user?.emailAddress ?? "unknown",
    quota: parseDriveQuota(data.storageQuota),
  };
}

export interface WalkOptions {
  /** Called once if the intentional depth cap caused any folder to be skipped. */
  onTruncated?: () => void;
  maxDepth?: number;
}

/**
 * Recursively walk a folder tree collecting every file item.
 * Traversal stops intentionally at `maxDepth` (default 6) levels; when that
 * happens `opts.onTruncated` fires so callers can surface it — nothing is
 * skipped silently.
 */
export async function walkAll(
  provider: StorageProvider,
  folderId: string,
  opts: WalkOptions = {}
): Promise<StorageItem[]> {
  const maxDepth = opts.maxDepth ?? WALK_MAX_DEPTH;
  let truncated = false;

  async function walk(fid: string, depth: number): Promise<StorageItem[]> {
    if (depth > maxDepth) {
      truncated = true;
      return [];
    }
    // provider.list() itself is fully paginated
    const items = await provider.list(fid);
    const out: StorageItem[] = [];
    for (const it of items) {
      if (it.isFolder) {
        out.push(...(await walk(it.id, depth + 1)));
      } else {
        out.push(it);
      }
    }
    return out;
  }

  const result = await walk(folderId, 0);
  if (truncated) opts.onTruncated?.();
  return result;
}
