"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Download, Trash2, RefreshCw, Upload, ImageOff } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes, fileKindOf } from "@/lib/format";
import type { StorageItem } from "@/lib/storage/types";
import { walkAll } from "@/lib/storage/drive";
import { AppHeader } from "../shell";

export default function PhotosApp() {
  const getProvider = usePhone((s) => s.getProvider);
  const showToast = usePhone((s) => s.showToast);

  const [images, setImages] = useState<StorageItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<StorageItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const thumbCache = useRef<Record<string, string>>({});

  const getThumbUrl = useCallback(
    async (item: StorageItem): Promise<string> => {
      if (thumbCache.current[item.id]) return thumbCache.current[item.id];
      const provider = getProvider();
      let url: string;
      if (provider.mediaUrl(item.id)) {
        url = provider.mediaUrl(item.id)!;
      } else {
        // Drive: fetch thumbnail (or full image) with auth header -> blob URL
        const src = item.thumbnailUrl;
        const res = await fetch(src ?? "-", {
          headers: src ? { Authorization: `Bearer ${(provider as { getToken?: () => string }).getToken?.() ?? ""}` } : undefined,
        }).catch(() => null);
        const blob = res && res.ok ? await res.blob() : await provider.download(item.id);
        url = URL.createObjectURL(blob);
      }
      thumbCache.current[item.id] = url;
      return url;
    },
    [getProvider]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      const all = await walkAll(provider, provider.rootId);
      const imgs = all
        .filter((f) => fileKindOf(f).kind === "image")
        .sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
      setImages(imgs);
      const next: Record<string, string> = {};
      await Promise.all(
        imgs.slice(0, 60).map(async (img) => {
          try {
            next[img.id] = await getThumbUrl(img);
          } catch {
            /* skip broken thumbs */
          }
        })
      );
      setUrls((u) => ({ ...u, ...next }));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [getProvider, getThumbUrl, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const viewerUrl = async (item: StorageItem) => {
    const provider = getProvider();
    if (provider.mediaUrl(item.id)) return provider.mediaUrl(item.id)!;
    const blob = await provider.download(item.id);
    return URL.createObjectURL(blob);
  };

  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!viewer) return setViewerSrc(null);
    let alive = true;
    (async () => {
      const url = urls[viewer.id] ?? (await viewerUrl(viewer).catch(() => null));
      if (alive) setViewerSrc(url);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const provider = getProvider();
    let ok = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        await provider.upload(provider.rootId, f);
        ok++;
      } catch {
        showToast(`Failed to upload ${f.name}`);
      }
    }
    if (ok) showToast(`${ok} photo${ok > 1 ? "s" : ""} added`);
    thumbCache.current = {};
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = async (item: StorageItem) => {
    try {
      await getProvider().remove(item.id);
      delete thumbCache.current[item.id];
      setViewer(null);
      showToast("Photo deleted");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const downloadPhoto = async (item: StorageItem) => {
    try {
      const provider = getProvider();
      if (provider.mediaUrl(item.id)) {
        window.open(`${provider.mediaUrl(item.id)}?download=1`, "_blank");
      } else {
        const blob = await provider.download(item.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = item.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      showToast("Download failed");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        title="Photos"
        onBack={() => usePhone.getState().closeApp()}
        right={
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload photos"
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
            >
              <Upload className="h-4 w-4 text-white/75" />
            </button>
            <button onClick={load} aria-label="Refresh" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 text-white/75 ${loading ? "animate-spin" : ""}`} />
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
          </>
        }
      />

      {loading ? (
        <div className="grid flex-1 grid-cols-3 content-start gap-0.5 p-0.5">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse bg-white/5" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ImageOff className="mb-3 h-10 w-10 text-white/15" />
          <p className="text-sm text-white/50">No photos yet</p>
          <p className="mt-1 px-8 text-[11px] leading-relaxed text-white/35">
            Take photos with the Camera app or upload images from your device
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-14 phone-scroll">
          <div className="grid grid-cols-3 gap-0.5">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setViewer(img)}
                className="group relative aspect-square overflow-hidden bg-white/5"
              >
                {urls[img.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[img.id]} alt={img.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="h-full w-full animate-pulse bg-white/10" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewer && (
        <div className="absolute inset-0 z-[58] flex flex-col bg-black/95">
          <div className="flex items-center gap-3 px-4 pt-10 pb-3">
            <button
              onClick={() => setViewer(null)}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{viewer.name}</p>
              <p className="text-[10px] text-white/45">{formatBytes(viewer.size)}</p>
            </div>
            <button onClick={() => downloadPhoto(viewer)} aria-label="Download" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <Download className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => removeImage(viewer)} aria-label="Delete" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-red-500/70">
              <Trash2 className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 pb-10">
            {viewerSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewerSrc} alt={viewer.name} className="max-h-full max-w-full rounded-xl object-contain" />
            ) : (
              <div className="h-40 w-40 animate-pulse rounded-2xl bg-white/10" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
