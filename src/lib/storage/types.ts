export interface StorageItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number;
  modifiedTime: string;
  thumbnailUrl?: string | null;
}

export interface QuotaInfo {
  usage: number;
  limit: number;
  label: string;
  files?: number;
}

export interface UploadOptions {
  name?: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface StorageProvider {
  readonly kind: "local" | "drive";
  /** Root folder id ("root" sentinel for local, resolved folder id for Drive) */
  readonly rootId: string;
  list(folderId: string): Promise<StorageItem[]>;
  upload(parentId: string, file: File | Blob, opts?: UploadOptions): Promise<StorageItem>;
  download(id: string): Promise<Blob>;
  createFolder(parentId: string, name: string): Promise<StorageItem>;
  remove(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  updateContent(id: string, content: string): Promise<void>;
  quota(): Promise<QuotaInfo>;
  /** Direct URL usable in <img>/<audio> (local only; drive returns null) */
  mediaUrl(id: string): string | null;
}

export class StorageError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}
