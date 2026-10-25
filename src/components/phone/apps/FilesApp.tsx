"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Folder,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Music,
  Video,
  FileArchive,
  FileCode,
  Package,
  Upload,
  FolderPlus,
  MoreVertical,
  Download,
  Trash2,
  Pencil,
  Cloud,
  HardDrive,
  ChevronRight,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { usePhone, accountGen } from "@/lib/phone-store";
import { formatBytes, formatDate, fileKindOf } from "@/lib/format";
import { parseApkBlob } from "@/lib/apk";
import type { ApkInfo } from "@/lib/apk";
import { ReviewCard } from "./PlayStoreApp";
import type { StorageItem, QuotaInfo } from "@/lib/storage/types";
import { AppHeader, PhoneDialog, PhoneToast } from "../shell";

interface Crumb {
  id: string;
  name: string;
}

export default function FilesApp() {
  const getProvider = usePhone((s) => s.getProvider);
  const storageMode = usePhone((s) => s.storageMode);
  const driveEmail = usePhone((s) => s.driveEmail);
  const driveQuota = usePhone((s) => s.driveQuota);
  const openApp = usePhone((s) => s.openApp);
  const showToast = usePhone((s) => s.showToast);
  const storageEpoch = usePhone((s) => s.storageEpoch);

  const [path, setPath] = useState<Crumb[]>([{ id: "root", name: "My Files" }]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<StorageItem | null>(null);
  const [dialog, setDialog] = useState<null | { type: "newFolder" | "rename" | "delete"; item?: StorageItem }>(null);
  const [inputVal, setInputVal] = useState("");
  const [preview, setPreview] = useState<{ item: StorageItem; url: string; text?: string } | null>(null);
  const [apkInstall, setApkInstall] = useState<{ item: StorageItem; blob: Blob } | null>(null);
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);
  const [apkParsing, setApkParsing] = useState(false);
  const [apkInstalling, setApkInstalling] = useState(false);
  const [apkPct, setApkPct] = useState(0);
  const installApkAction = usePhone((s) => s.installApk);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const current = path[path.length - 1];

  const refresh = useCallback(async () => {
    const gen = accountGen();
    setLoading(true);
    try {
      const provider = getProvider();
      const list = await provider.list(current.id);
      const q = await provider.quota();
      if (gen !== accountGen()) return; // account changed mid-flight — discard
      setItems(list);
      setQuota(q);
    } catch (e) {
      if (gen !== accountGen()) return;
      showToast(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      if (gen === accountGen()) setLoading(false);
    }
  }, [current.id, getProvider, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh, storageEpoch]);

  const openItem = async (item: StorageItem) => {
    if (item.isFolder) {
      setPath((p) => [...p, { id: item.id, name: item.name }]);
      return;
    }
    const provider = getProvider();
    const kind = fileKindOf(item).kind;
    try {
      if (kind === "image") {
        const url = provider.mediaUrl(item.id) ?? URL.createObjectURL(await provider.download(item.id));
        setPreview({ item, url });
      } else if (kind === "text" || item.mimeType.startsWith("text/")) {
        const blob = await provider.download(item.id);
        const text = await blob.text();
        const url = URL.createObjectURL(blob);
        setPreview({ item, url, text });
      } else if (kind === "apk") {
        const blob = await provider.download(item.id);
        setApkInstall({ item, blob });
      } else {
        downloadItem(item);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not open file");
    }
  };

  const downloadItem = async (item: StorageItem) => {
    const provider = getProvider();
    try {
      if (provider.kind === "local") {
        window.open(`/api/storage/file/${item.id}?download=1`, "_blank");
      } else {
        const blob = await provider.download(item.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = item.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      showToast(`Downloading ${item.name}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const provider = getProvider();
    let done = 0;
    for (const f of Array.from(files)) {
      try {
        setUploadPct(0);
        await provider.upload(current.id, f, {
          onProgress: (loaded, total) => setUploadPct(Math.round((loaded / total) * 100)),
        });
        done++;
      } catch (e) {
        showToast(e instanceof Error ? e.message : `Failed to upload ${f.name}`);
      } finally {
        setUploadPct(null);
      }
    }
    if (done > 0) showToast(`${done} file${done > 1 ? "s" : ""} uploaded`);
    refresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitDialog = async () => {
    const provider = getProvider();
    try {
      if (dialog?.type === "newFolder") {
        if (!inputVal.trim()) return;
        await provider.createFolder(current.id, inputVal.trim());
        showToast("Folder created");
      } else if (dialog?.type === "rename" && dialog.item) {
        if (!inputVal.trim()) return;
        await provider.rename(dialog.item.id, inputVal.trim());
        showToast("Renamed");
      } else if (dialog?.type === "delete" && dialog.item) {
        await provider.remove(dialog.item.id);
        showToast(provider.kind === "drive" ? "Moved to Drive trash" : "Deleted");
      }
      setDialog(null);
      setInputVal("");
      refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed");
    }
  };

  const closeApkInstall = () => {
    setApkInstall(null);
    setApkInfo(null);
    setApkPct(0);
  };

  /* parse the APK whenever an install dialog opens */
  useEffect(() => {
    if (!apkInstall) return;
    const gen = accountGen();
    setApkParsing(true);
    setApkInfo(null);
    parseApkBlob(apkInstall.blob, apkInstall.item.name)
      .then((info) => {
        if (gen !== accountGen()) return;
        setApkInfo(info);
      })
      .catch((e) => {
        if (gen !== accountGen()) return;
        showToast(e instanceof Error ? e.message : "Could not read this APK file");
        closeApkInstall();
      })
      .finally(() => {
        if (gen === accountGen()) setApkParsing(false);
      });
  }, [apkInstall, showToast]);

  const submitApkInstall = async () => {
    if (!apkInstall || !apkInfo) return;
    setApkInstalling(true);
    setApkPct(0);
    try {
      const app = await installApkAction({
        blob: apkInstall.blob,
        fileName: apkInstall.item.name,
        info: apkInfo,
        existingFileId: apkInstall.item.id,
        onProgress: (loaded, total) => {
          if (total > 0) setApkPct(Math.round((loaded / total) * 100));
        },
      });
      showToast(`${app.label} installed - see Play Store > My apps`);
      closeApkInstall();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Installation failed");
    } finally {
      setApkInstalling(false);
    }
  };

  const storageUsed = () => {
    if (quota)
      return {
        used: quota.usage,
        limit: quota.limit,
        label: quota.label,
        unlimited: quota.unlimited ?? false,
        usageInDrive: quota.usageInDrive,
      };
    if (storageMode === "drive" && driveQuota)
      return {
        used: driveQuota.usage,
        limit: driveQuota.limit,
        label: "Google Drive",
        unlimited: driveQuota.unlimited ?? false,
        usageInDrive: driveQuota.usageInDrive,
      };
    return null;
  };

  const used = storageUsed();
  const pct = used && !used.unlimited && used.limit > 0 ? Math.min(100, (used.used / used.limit) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        title="My Files"
        onBack={() => {
          if (path.length > 1) setPath((p) => p.slice(0, -1));
          else usePhone.getState().closeApp();
        }}
        right={
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 text-white/70 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {/* storage card */}
      <div className="mx-4 mb-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 font-medium text-white/85">
            {storageMode === "drive" ? (
              <Cloud className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <HardDrive className="h-3.5 w-3.5 text-white/50" />
            )}
            {storageMode === "drive" ? "Google Drive" : "Virtual storage"}
            {used ? <span className="text-white/40">- {used.label}</span> : null}
          </span>
          {used && (
            <span className="text-white/55">
              {used.unlimited
                ? `${formatBytes(used.used)} used`
                : `${formatBytes(used.used)} / ${formatBytes(used.limit)}`}
            </span>
          )}
        </div>
        {used && !used.unlimited && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${storageMode === "drive" ? "bg-emerald-400" : "bg-teal-400"}`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
        )}
        {used && used.unlimited && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full w-full rounded-full ${storageMode === "drive" ? "bg-emerald-400/40" : "bg-teal-400/40"}`} />
          </div>
        )}
        {storageMode === "drive" && used && (
          <p className="mt-1.5 text-[10px] text-white/35">
            Google account usage - Drive files use {formatBytes(used.usageInDrive ?? used.used)}
          </p>
        )}
        {storageMode === "local" && (
          <button
            onClick={() => openApp("settings")}
            className="mt-2.5 w-full rounded-xl bg-emerald-500/15 py-2 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/25"
          >
            Connect Google Drive to use your cloud quota as phone storage
          </button>
        )}
      </div>

      {/* breadcrumb + actions */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 pb-2 no-scrollbar">
        {path.map((c, i) => (
          <span key={c.id} className="flex shrink-0 items-center">
            {i > 0 && <ChevronRight className="h-3 w-3 text-white/30" />}
            <button
              onClick={() => setPath((p) => p.slice(0, i + 1))}
              className={`rounded-lg px-1.5 py-0.5 text-[11px] ${i === path.length - 1 ? "font-semibold text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 active:scale-[0.98]"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <button
          onClick={() => {
            setInputVal("");
            setDialog({ type: "newFolder" });
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 active:scale-[0.98]"
        >
          <FolderPlus className="h-3.5 w-3.5" /> New folder
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {uploadPct !== null && (
        <div className="mx-4 mb-2 rounded-xl bg-white/10 p-2.5">
          <div className="flex justify-between text-[10px] text-white/70">
            <span>Uploading…</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      {/* file list */}
      <div className="flex-1 overflow-y-auto px-2 pb-14 phone-scroll">
        {loading ? (
          <div className="space-y-2 px-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <Folder className="mb-3 h-10 w-10 text-white/15" />
            <p className="text-sm text-white/50">This folder is empty</p>
            <p className="mt-1 text-[11px] text-white/35">Upload files or create a folder</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              const meta = fileKindOf(item);
              return (
                <li key={item.id} className="relative">
                  <button
                    onClick={() => openItem(item)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.07]"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]`}>
                      {meta.kind === "folder" ? (
                        <Folder className="h-5 w-5 text-amber-400" />
                      ) : meta.kind === "image" ? (
                        <ImageIcon className="h-5 w-5 text-emerald-400" />
                      ) : meta.kind === "audio" ? (
                        <Music className="h-5 w-5 text-violet-400" />
                      ) : meta.kind === "video" ? (
                        <Video className="h-5 w-5 text-rose-400" />
                      ) : meta.kind === "pdf" ? (
                        <FileText className="h-5 w-5 text-red-400" />
                      ) : meta.kind === "archive" ? (
                        <FileArchive className="h-5 w-5 text-orange-400" />
                      ) : meta.kind === "apk" ? (
                        <Package className="h-5 w-5 text-lime-400" />
                      ) : meta.kind === "text" ? (
                        <FileCode className="h-5 w-5 text-teal-300" />
                      ) : (
                        <FileIcon className="h-5 w-5 text-slate-300" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-white/90">{item.name}</span>
                      <span className="mt-0.5 block text-[10.5px] text-white/40">
                        {item.isFolder ? "Folder" : `${formatBytes(item.size)} - ${formatDate(item.modifiedTime)}`}
                      </span>
                    </span>
                    <span
                      role="button"
                      aria-label={`Options for ${item.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor?.id === item.id ? null : item);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
                    >
                      <MoreVertical className="h-4 w-4 text-white/50" />
                    </span>
                  </button>

                  {menuFor?.id === item.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-3 top-11 z-50 w-40 overflow-hidden rounded-2xl bg-zinc-900 py-1 shadow-2xl ring-1 ring-white/15">
                        {menuFor.isFolder ? (
                          <MenuItem icon={Folder} label="Open" onClick={() => { setMenuFor(null); openItem(menuFor); }} />
                        ) : (
                          <MenuItem icon={FileIcon} label="Open" onClick={() => { setMenuFor(null); openItem(menuFor); }} />
                        )}
                        {!menuFor.isFolder && (
                          <MenuItem icon={Download} label="Download" onClick={() => { setMenuFor(null); downloadItem(menuFor); }} />
                        )}
                        <MenuItem
                          icon={Pencil}
                          label="Rename"
                          onClick={() => {
                            setInputVal(menuFor.name);
                            setDialog({ type: "rename", item: menuFor });
                            setMenuFor(null);
                          }}
                        />
                        <MenuItem
                          icon={Trash2}
                          label="Delete"
                          danger
                          onClick={() => {
                            setDialog({ type: "delete", item: menuFor });
                            setMenuFor(null);
                          }}
                        />
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* dialogs */}
      <PhoneDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
      >
        {dialog?.type === "delete" ? (
          <>
            <h3 className="text-base font-semibold text-white">Delete {dialog.item?.isFolder ? "folder" : "file"}?</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-white/60">
              &ldquo;{dialog.item?.name}&rdquo; will be {storageMode === "drive" ? "moved to Google Drive trash" : "permanently removed from virtual storage"}.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="rounded-full px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10">
                Cancel
              </button>
              <button onClick={submitDialog} className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400">
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-white">{dialog?.type === "newFolder" ? "New folder" : "Rename"}</h3>
            <input
              autoFocus
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDialog()}
              placeholder="Enter name"
              className="mt-3 w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none ring-1 ring-white/15 placeholder:text-white/30 focus:ring-emerald-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="rounded-full px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10">
                Cancel
              </button>
              <button onClick={submitDialog} className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400">
                {dialog?.type === "newFolder" ? "Create" : "Save"}
              </button>
            </div>
          </>
        )}
      </PhoneDialog>

      {/* APK install dialog */}
      <PhoneDialog open={apkInstall !== null} onClose={closeApkInstall}>
        <div className="w-full max-w-[320px] rounded-3xl bg-zinc-900 p-5 ring-1 ring-white/15">
          <h3 className="text-sm font-semibold text-white">Install APK</h3>
          {apkParsing || !apkInfo ? (
            <div className="flex items-center gap-2.5 py-6 text-xs text-white/60">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-300" /> Reading Android manifest…
            </div>
          ) : (
            <>
              <ReviewCard info={apkInfo} sizeBytes={apkInstall?.blob.size ?? 0} fileName={apkInstall?.item.name ?? ""} />
              {apkInstalling && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-white/60">
                    <span>Installing…</span>
                    <span>{apkPct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.max(apkPct, 3)}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={closeApkInstall}
                  disabled={apkInstalling}
                  className="flex-1 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submitApkInstall()}
                  disabled={apkInstalling}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-[11px] font-bold text-white transition hover:bg-emerald-400 disabled:opacity-40"
                >
                  {apkInstalling ? "Installing…" : "Install"}
                </button>
              </div>
            </>
          )}
        </div>
      </PhoneDialog>

      {/* preview overlay */}
      {preview && (
        <div className="absolute inset-0 z-[58] flex flex-col bg-black/95">
          <div className="flex items-center gap-3 px-4 pt-10 pb-3">
            <button
              onClick={() => setPreview(null)}
              aria-label="Close preview"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{preview.item.name}</p>
            <button
              onClick={() => downloadItem(preview.item)}
              aria-label="Download"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <Download className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto px-4 pb-10">
            {preview.text !== undefined ? (
              <pre className="max-h-full w-full overflow-auto whitespace-pre-wrap rounded-2xl bg-white/5 p-4 text-[11px] leading-relaxed text-white/80 phone-scroll">
                {preview.text}
              </pre>
            ) : (
               
              <img src={preview.url} alt={preview.item.name} className="max-h-full max-w-full rounded-xl object-contain" />
            )}
          </div>
        </div>
      )}

      <PhoneToast />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium transition ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-white/85 hover:bg-white/10"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
