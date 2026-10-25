import { StorageItem, QuotaInfo, StorageProvider, UploadOptions, StorageError } from "./types";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const PHONE_ROOT_FOLDER = "PhoneStorage";

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

async function driveFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    throw new StorageError("Drive session expired — reconnect Google Drive in Settings", 401);
  }
  return res;
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

/**
 * DriveProvider — uses the user's real Google Drive (their plan quota, e.g. 5 TB)
 * as the phone's storage. All phone content lives inside a "PhoneStorage" folder
 * in the Drive root to keep things tidy.
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

  async list(folderId: string): Promise<StorageItem[]> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await driveFetch(
      this.token,
      `/files?q=${q}&pageSize=200&orderBy=folder,name&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,hasThumbnail,thumbnailLink)`
    );
    if (!res.ok) throw new StorageError("Failed to list Drive files", res.status);
    const data = await res.json();
    return (data.files ?? []).map(toItem);
  }

  /** Resumable upload via XHR so we get progress events; works for any file size. */
  upload(parentId: string, file: File | Blob, opts?: UploadOptions): Promise<StorageItem> {
    const name = opts?.name ?? (file instanceof File ? file.name : "file");
    const mime = (file instanceof File ? file.type : "") || "application/octet-stream";
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
          } else {
            reject(new StorageError(`Drive upload failed (${xhr.status})`, xhr.status));
          }
        };
        xhr.onerror = () => reject(new Error("Drive upload failed (network)"));
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
            } else if (xhr.status === 401) {
              reject(new StorageError("Drive session expired — reconnect in Settings", 401));
            } else {
              reject(new Error(`Drive upload failed (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error("Drive upload failed (network)"));
          if (opts?.signal) {
            opts.signal.addEventListener("abort", () => {
              xhr.abort();
              reject(new Error("Upload cancelled"));
            });
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

  async updateContent(id: string, content: string): Promise<void> {
    const res = await driveFetch(
      this.token,
      `${UPLOAD_API}/files/${id}?uploadType=media`,
      { method: "PATCH", headers: { "Content-Type": "text/plain" }, body: content }
    );
    if (!res.ok) throw new StorageError("Failed to save to Drive", res.status);
  }

  async quota(): Promise<QuotaInfo> {
    const res = await driveFetch(this.token, `/about?fields=storageQuota`);
    if (!res.ok) throw new StorageError("Failed to read Drive quota", res.status);
    const q = (await res.json()).storageQuota ?? {};
    return {
      usage: Number(q.usageInDrive ?? q.usage ?? 0),
      limit: Number(q.limit ?? 0),
      label: "Google Drive",
    };
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
    `${API}/files?q=${q}&fields=files(id,name)&pageSize=5`,
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

/** Fetch Drive account info (email + quota) with a fresh token. */
export async function fetchDriveAbout(token: string): Promise<{
  email: string;
  quota: { usage: number; limit: number };
}> {
  const res = await fetch(`${API}/about?fields=user,storageQuota`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new StorageError("Failed to read Drive account info", res.status);
  const data = await res.json();
  return {
    email: data.user?.emailAddress ?? "unknown",
    quota: {
      usage: Number(data.storageQuota?.usageInDrive ?? 0),
      limit: Number(data.storageQuota?.limit ?? 0),
    },
  };
}

/** Recursively walk a folder tree collecting every file item (depth-capped). */
export async function walkAll(provider: StorageProvider, folderId: string, depth = 0): Promise<StorageItem[]> {
  if (depth > 6) return [];
  const items = await provider.list(folderId);
  const out: StorageItem[] = [];
  for (const it of items) {
    if (it.isFolder) {
      const nested = await walkAll(provider, it.id, depth + 1);
      out.push(...nested);
    } else {
      out.push(it);
    }
  }
  return out;
}
