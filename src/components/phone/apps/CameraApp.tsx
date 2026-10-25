"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, SwitchCamera, Camera, FolderOpen } from "lucide-react";
import { usePhone } from "@/lib/phone-store";

export default function CameraApp() {
  const getProvider = usePhone((s) => s.getProvider);
  const showToast = usePhone((s) => s.showToast);
  const openApp = usePhone((s) => s.openApp);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "user" | "environment") => {
      stop();
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError(
          "Camera is not available in this environment. Grant camera permission in your browser, or use Photos to upload pictures instead."
        );
      }
    },
    [stop]
  );

  useEffect(() => {
    start(facing);
    return stop;
  }, [facing, start, stop]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) {
      showToast("Camera unavailable");
      return;
    }
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Capture failed");

      const provider = getProvider();
      // ensure Pictures folder exists
      let picsId = provider.rootId;
      const rootItems = await provider.list(provider.rootId);
      const pics = rootItems.find((i) => i.isFolder && i.name === "Pictures");
      if (pics) picsId = pics.id;
      else picsId = (await provider.createFolder(provider.rootId, "Pictures")).id;

      await provider.upload(picsId, blob, { name: `IMG_${Date.now()}.jpg` });
      showToast("Photo saved to Pictures");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-10 pb-3">
        <button
          onClick={() => usePhone.getState().closeApp()}
          aria-label="Close camera"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-4 w-4 text-white" />
        </button>
        <p className="text-xs font-semibold tracking-widest text-white/70">CAMERA</p>
        <button
          onClick={() => openApp("photos")}
          aria-label="Open Photos"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <FolderOpen className="h-4 w-4 text-white" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 px-10 text-center">
            <Camera className="mb-4 h-10 w-10 text-white/20" />
            <p className="text-[12.5px] leading-relaxed text-white/55">{error}</p>
            <button
              onClick={() => openApp("photos")}
              className="mt-5 rounded-full bg-emerald-500/90 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Go to Photos
            </button>
          </div>
        )}
        {flash && <div className="absolute inset-0 z-10 bg-white" />}
      </div>

      <div className="flex items-center justify-between px-10 pb-12 pt-5">
        <button
          onClick={() => openApp("photos")}
          aria-label="Gallery"
          className="h-11 w-11 rounded-xl bg-white/15 ring-1 ring-white/25 transition hover:bg-white/25"
        />
        <button
          onClick={capture}
          disabled={busy}
          aria-label="Take photo"
          className="flex h-[70px] w-[70px] items-center justify-center rounded-full ring-4 ring-white/80 transition active:scale-90 disabled:opacity-50"
        >
          <span className="h-[54px] w-[54px] rounded-full bg-white" />
        </button>
        <button
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Switch camera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          <SwitchCamera className="h-5 w-5 text-white" />
        </button>
      </div>
    </div>
  );
}
