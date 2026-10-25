"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Music2, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { usePhone, accountGen } from "@/lib/phone-store";
import { formatBytes, twoDigits } from "@/lib/format";
import type { StorageItem } from "@/lib/storage/types";
import { walkAll } from "@/lib/storage/drive";
import { AppHeader } from "../shell";

export default function MusicApp() {
  const getProvider = usePhone((s) => s.getProvider);
  const showToast = usePhone((s) => s.showToast);
  const storageEpoch = usePhone((s) => s.storageEpoch);

  const [tracks, setTracks] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<StorageItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [loadingTrack, setLoadingTrack] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const gen = accountGen();
    setLoading(true);
    try {
      const provider = getProvider();
      const all = await walkAll(provider, provider.rootId, {
        onTruncated: () =>
          showToast("Some deep folders were skipped (6-level traversal limit)"),
      });
      if (gen !== accountGen()) return; // account switched mid-walk — discard
      setTracks(all.filter((f) => f.mimeType.startsWith("audio/")).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      if (gen !== accountGen()) return;
      showToast(e instanceof Error ? e.message : "Failed to load music");
    } finally {
      if (gen === accountGen()) setLoading(false);
    }
  }, [getProvider, showToast]);

  useEffect(() => {
    load();
  }, [load, storageEpoch]);

  const playTrack = async (track: StorageItem) => {
    try {
      setLoadingTrack(track.id);
      const provider = getProvider();
      const blob = await provider.download(track.id);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
      setCurrent(track);
      setPlaying(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not play track");
    } finally {
      setLoadingTrack(null);
    }
  };

  const toggle = () => {
    if (!audioRef.current || !current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const skip = (dir: 1 | -1) => {
    if (tracks.length === 0) return;
    const idx = current ? tracks.findIndex((t) => t.id === current.id) : -1;
    const next = tracks[(idx + dir + tracks.length) % tracks.length];
    playTrack(next);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPos(audio.currentTime);
    const onMeta = () => setDur(audio.duration || 0);
    const onEnd = () => skip(1);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
     
  }, [audioRef.current, tracks, current]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${twoDigits(Math.floor(s % 60))}`;

  return (
    <div className="flex h-full flex-col">
      <AppHeader title="Music" onBack={() => usePhone.getState().closeApp()} />

      {loading ? (
        <div className="space-y-2 px-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <Music2 className="mb-3 h-10 w-10 text-white/15" />
          <p className="text-sm text-white/50">No audio files found</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/35">
            Upload MP3 or other audio files with the Files app and they will appear here
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 phone-scroll">
            {tracks.map((t, i) => (
              <button
                key={t.id}
                onClick={() => playTrack(t)}
                className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition ${
                  current?.id === t.id ? "bg-emerald-500/15 ring-1 ring-emerald-400/30" : "hover:bg-white/[0.07]"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30">
                  {loadingTrack === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/80" />
                  ) : current?.id === t.id && playing ? (
                    <Pause className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <Play className="h-4 w-4 text-white/70" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-medium ${current?.id === t.id ? "text-emerald-300" : "text-white/90"}`}>
                    {t.name}
                  </span>
                  <span className="text-[10.5px] text-white/40">
                    Track {i + 1} - {formatBytes(t.size)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {current && (
            <div className="mx-3 mb-16 rounded-3xl bg-white/[0.08] p-4 ring-1 ring-white/10">
              <p className="truncate text-center text-[13px] font-semibold text-white">{current.name}</p>
              <div
                className="mt-3 h-1.5 cursor-pointer overflow-hidden rounded-full bg-white/10"
                onClick={(e) => {
                  if (!audioRef.current || !dur) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  audioRef.current.currentTime = ratio * dur;
                }}
              >
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/45">
                <span>{fmtTime(pos)}</span>
                <span>{fmtTime(dur)}</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-6">
                <button onClick={() => skip(-1)} aria-label="Previous" className="text-white/80 transition hover:text-white">
                  <SkipBack className="h-5 w-5" />
                </button>
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause" : "Play"}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-90"
                >
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
                </button>
                <button onClick={() => skip(1)} aria-label="Next" className="text-white/80 transition hover:text-white">
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
