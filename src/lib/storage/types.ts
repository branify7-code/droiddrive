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
  /**
   * Drive mode: TOTAL Google account usage (all products, per Google's
   * about.storageQuota.usage). Local mode: bytes used in the virtual store.
   */
  usage: number;
  /** Drive-only usage (Drive mode), when reported by the API. */
  usageInDrive?: number;
  /** Capacity cap. 0 means "unknown / no reported limit" — UI must never render this as a 0-capacity device. */
  limit: number;
  /** True when Google reports no numeric limit. */
  unlimited?: boolean;
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
    this.name = "StorageError";
    this.status = status;
  }
}

/**
 * Thrown when Drive mode is active but the OAuth access token is missing or
 * expired. The store NEVER silently falls back to local storage — the user
 * must reconnect Drive or explicitly switch storage modes.
 */
export class DriveSessionExpiredError extends StorageError {
  constructor() {
    super("Google Drive session expired — reconnect to continue.", 401);
    this.name = "DriveSessionExpiredError";
  }
}
