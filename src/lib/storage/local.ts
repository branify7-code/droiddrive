import { StorageItem, QuotaInfo, StorageProvider, UploadOptions, StorageError } from "./types";

/**
 * LocalProvider — virtual device storage backed by the app's own API routes
 * (Prisma metadata + blob files on disk). The server requires an authenticated
 * session and scopes every row to the caller; when a 401 comes back we invoke
 * the registered handler (the UI sign-in dialog) instead of failing silently.
 */

type LocalAuthHandler = (message: string) => void;

let authHandler: LocalAuthHandler | null = null;

/** Register the UI callback invoked whenever the local API returns 401. */
export function setLocalAuthHandler(fn: LocalAuthHandler | null) {
  authHandler = fn;
}

function statusMessage(status: number, fallback: string, body?: { error?: string }): Error {
  if (status === 401) {
    const msg = body?.error || "Sign in to use local storage";
    authHandler?.(msg);
    return new StorageError(msg, 401);
  }
  return new StorageError(body?.error || fallback, status);
}

async function readError(res: Response): Promise<{ error?: string } | undefined> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return undefined;
  }
}

export class LocalProvider implements StorageProvider {
  readonly kind = "local" as const;
  readonly rootId = "root";

  async list(folderId: string): Promise<StorageItem[]> {
    const res = await fetch(`/api/storage/list?folderId=${encodeURIComponent(folderId)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw statusMessage(res.status, "Failed to list files", await readError(res));
    const data = await res.json();
    return data.items as StorageItem[];
  }

  upload(parentId: string, file: File | Blob, opts?: UploadOptions): Promise<StorageItem> {
    const form = new FormData();
    form.append("file", file as Blob, opts?.name ?? (file instanceof File ? file.name : "file"));
    form.append("folderId", parentId);

    return new Promise<StorageItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/storage/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts?.onProgress?.(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText).item as StorageItem);
          } catch {
            reject(new Error("Bad server response"));
          }
        } else {
          let body: { error?: string } | undefined;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON error */
          }
          reject(statusMessage(xhr.status, `Upload failed (${xhr.status})`, body));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed (network error)"));
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
      xhr.send(form);
    });
  }

  async download(id: string): Promise<Blob> {
    const res = await fetch(`/api/storage/file/${id}`);
    if (!res.ok) throw statusMessage(res.status, "Failed to download file", await readError(res));
    return res.blob();
  }

  async createFolder(parentId: string, name: string): Promise<StorageItem> {
    const res = await fetch("/api/storage/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folderId: parentId }),
    });
    if (!res.ok) throw statusMessage(res.status, "Failed to create folder", await readError(res));
    const data = await res.json();
    return data.item as StorageItem;
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, { method: "DELETE" });
    if (!res.ok) throw statusMessage(res.status, "Failed to delete", await readError(res));
  }

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw statusMessage(res.status, "Failed to rename", await readError(res));
  }

  async updateContent(id: string, content: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: content,
    });
    if (!res.ok) throw statusMessage(res.status, "Failed to save", await readError(res));
  }

  async quota(): Promise<QuotaInfo> {
    const res = await fetch("/api/storage/quota", { cache: "no-store" });
    if (!res.ok) throw statusMessage(res.status, "Failed to read quota", await readError(res));
    return res.json();
  }

  mediaUrl(id: string): string | null {
    return `/api/storage/file/${id}`;
  }
}
