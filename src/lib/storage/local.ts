import { StorageItem, QuotaInfo, StorageProvider, UploadOptions } from "./types";

/**
 * LocalProvider — virtual device storage backed by the app's own API routes
 * (Prisma metadata + blob files on disk). Used until Google Drive is connected.
 */
export class LocalProvider implements StorageProvider {
  readonly kind = "local" as const;
  readonly rootId = "root";

  async list(folderId: string): Promise<StorageItem[]> {
    const res = await fetch(`/api/storage/list?folderId=${encodeURIComponent(folderId)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to list files");
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
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      if (opts?.signal) {
        opts.signal.addEventListener("abort", () => {
          xhr.abort();
          reject(new Error("Upload cancelled"));
        });
      }
      xhr.send(form);
    });
  }

  async download(id: string): Promise<Blob> {
    const res = await fetch(`/api/storage/file/${id}`);
    if (!res.ok) throw new Error("Failed to download file");
    return res.blob();
  }

  async createFolder(parentId: string, name: string): Promise<StorageItem> {
    const res = await fetch("/api/storage/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folderId: parentId }),
    });
    if (!res.ok) throw new Error("Failed to create folder");
    const data = await res.json();
    return data.item as StorageItem;
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");
  }

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to rename");
  }

  async updateContent(id: string, content: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`, { method: "PUT", body: content });
    if (!res.ok) throw new Error("Failed to save");
  }

  async quota(): Promise<QuotaInfo> {
    const res = await fetch("/api/storage/quota", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to read quota");
    return res.json();
  }

  mediaUrl(id: string): string | null {
    return `/api/storage/file/${id}`;
  }
}
