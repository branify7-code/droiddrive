"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Circle,
  Square,
  Lock,
  Wifi,
  WifiOff,
  BatteryFull,
  Signal,
  Settings,
  Power,
  Sun,
  X,
  Cloud,
  HardDrive,
  Bluetooth,
  BellOff,
  Plane,
  Flashlight,
  Camera,
} from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes } from "@/lib/format";
import type { AppDef } from "./apps/registry";

/* ============ hooks & helpers ============ */

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtTime(d: Date, seconds = false) {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  });
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/* ============ wallpaper ============ */

export function Wallpaper() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(165deg,#0c211d_0%,#0a1614_45%,#0d1214_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(65%_45%_at_78%_18%,rgba(16,185,129,0.28),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_15%_75%,rgba(20,184,166,0.18),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_50%_105%,rgba(245,158,11,0.10),transparent_70%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.05]" aria-hidden>
        <defs>
          <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

/* ============ status bar ============ */

export function StatusBar() {
  const now = useNow(5000);
  const setShadeOpen = usePhone((s) => s.setShadeOpen);
  const toggles = usePhone((s) => s.toggles);
  const storageMode = usePhone((s) => s.storageMode);

  return (
    <button
      type="button"
      aria-label="Open notification shade"
      onClick={() => setShadeOpen(true)}
      className="relative z-30 flex h-8 w-full cursor-pointer select-none items-center justify-between px-5 text-[11px] font-medium text-white/95"
    >
      <span className="tracking-wide">{fmtTime(now)}</span>
      <span className="flex items-center gap-1.5">
        {storageMode === "drive" ? (
          <Cloud className="h-3 w-3 text-emerald-300" aria-label="Google Drive connected" />
        ) : (
          <HardDrive className="h-3 w-3 text-white/60" aria-label="Local storage" />
        )}
        {toggles.airplane ? (
          <Plane className="h-3 w-3" />
        ) : (
          <>
            <Signal className="h-3 w-3" />
            {toggles.wifi ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 text-white/40" />}
          </>
        )}
        <span className="ml-0.5">100</span>
        <BatteryFull className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

/* ============ navigation bar (3-button) ============ */

export function NavBar() {
  const back = usePhone((s) => s.back);
  const goHome = usePhone((s) => s.goHome);
  const setRecentsOpen = usePhone((s) => s.setRecentsOpen);

  return (
    <nav
      className="absolute inset-x-0 bottom-0 z-40 flex h-9 items-center justify-around bg-black/35 px-12 backdrop-blur-sm"
      aria-label="System navigation"
    >
      <button
        onClick={back}
        aria-label="Back"
        className="flex h-8 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
      >
        <ChevronLeft className="h-5 w-5 text-white/85" />
      </button>
      <button
        onClick={goHome}
        aria-label="Home"
        className="flex h-8 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
      >
        <Circle className="h-[18px] w-[18px] text-white/85" strokeWidth={2.2} />
      </button>
      <button
        onClick={() => setRecentsOpen(true)}
        aria-label="Recent apps"
        className="flex h-8 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
      >
        <Square className="h-[15px] w-[15px] text-white/85" strokeWidth={2.2} />
      </button>
    </nav>
  );
}

/* ============ boot screen ============ */

export function BootScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#070b0a]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative flex h-20 w-20 items-center justify-center"
      >
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-400" />
        <Cloud className="h-8 w-8 text-emerald-400" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-sm font-medium tracking-[0.3em] text-white/70"
      >
        droiddrive
      </motion.p>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ============ lock screen ============ */

export function LockScreen() {
  const now = useNow(1000);
  const unlock = usePhone((s) => s.unlock);
  const openApp = usePhone((s) => s.openApp);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    if (dy < 0) setDragY(dy);
  };
  const onPointerUp = () => {
    if (startY.current === null) return;
    if (dragY < -70) unlock();
    setDragY(0);
    startY.current = null;
  };

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col text-white"
      exit={{ y: -600, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => {
        if (dragY === 0) unlock();
      }}
      style={{ touchAction: "none" }}
    >
      <div className="mt-24 flex flex-col items-center gap-1" style={{ transform: `translateY(${dragY * 0.4}px)` }}>
        <Lock className="mb-3 h-5 w-5 text-white/70" />
        <p className="text-[72px] font-extralight leading-none tracking-tight drop-shadow-lg">
          {fmtTime(now)}
        </p>
        <p className="mt-2 text-sm font-medium text-white/75">{fmtDate(now)}</p>
      </div>

      <div className="mt-auto mb-20 flex flex-col items-center gap-4">
        <motion.div
          animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur"
        >
          <ChevronLeft className="h-5 w-5 -rotate-90 text-white/90" />
        </motion.div>
        <p className="text-xs tracking-widest text-white/60">SWIPE UP TO UNLOCK</p>
      </div>

      <div className="mb-14 flex justify-between px-10">
        <button
          aria-label="Camera shortcut"
          onClick={(e) => {
            e.stopPropagation();
            unlock();
            openApp("camera");
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20"
        >
          <Camera className="h-5 w-5 text-white/85" />
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur">
          <Flashlight className="h-5 w-5 text-white/85" />
        </div>
      </div>
    </motion.div>
  );
}

/* ============ notification shade ============ */

export function Shade() {
  const shadeOpen = usePhone((s) => s.shadeOpen);
  const setShadeOpen = usePhone((s) => s.setShadeOpen);
  const toggles = usePhone((s) => s.toggles);
  const toggleSwitch = usePhone((s) => s.toggleSwitch);
  const brightness = usePhone((s) => s.brightness);
  const setBrightness = usePhone((s) => s.setBrightness);
  const lock = usePhone((s) => s.lock);
  const openApp = usePhone((s) => s.openApp);
  const storageMode = usePhone((s) => s.storageMode);
  const driveEmail = usePhone((s) => s.driveEmail);
  const driveQuota = usePhone((s) => s.driveQuota);
  const now = useNow(10_000);

  const chips = [
    { key: "wifi" as const, icon: Wifi, label: "Wi-Fi", on: toggles.wifi },
    { key: "bt" as const, icon: Bluetooth, label: "Bluetooth", on: toggles.bt },
    { key: "dnd" as const, icon: BellOff, label: "Do Not Disturb", on: toggles.dnd },
    { key: "airplane" as const, icon: Plane, label: "Airplane mode", on: toggles.airplane },
  ];

  return (
    <AnimatePresence>
      {shadeOpen && (
        <motion.div
          key="shade"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className="absolute inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-xl"
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center justify-between px-5 pt-9 text-xs text-white/70">
            <span>{fmtDate(now)}</span>
            <span>{fmtTime(now)}</span>
          </div>

          <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => toggleSwitch(c.key)}
                className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left text-xs font-medium transition ${
                  c.on ? "bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/20" : "bg-white/10 text-white/60"
                }`}
              >
                <c.icon className="h-4 w-4 shrink-0" />
                {c.label}
              </button>
            ))}
          </div>

          <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <Sun className="h-4 w-4 shrink-0 text-white/80" />
            <input
              type="range"
              min={20}
              max={100}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              aria-label="Brightness"
              className="dd-range flex-1"
            />
          </div>

          <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-4 no-scrollbar">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Notifications
            </p>
            <div className="flex items-start gap-3 rounded-2xl bg-white/10 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25">
                <Cloud className="h-4.5 w-4.5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/90">Welcome to DroidDrive</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                  Your virtual Android phone is ready. Open Settings to connect Google Drive and use
                  your cloud quota as phone storage.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-white/10 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/25">
                <HardDrive className="h-4.5 w-4.5 text-teal-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/90">
                  {storageMode === "drive" ? "Google Drive connected" : "Local storage in use"}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                  {storageMode === "drive"
                    ? `${driveEmail ?? ""} - ${
                        driveQuota ? `${formatBytes(driveQuota.usage)} of ${formatBytes(driveQuota.limit)} used` : ""
                      }`
                    : "Files are saved on the virtual device. Connect Drive for 5 TB cloud storage."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 pb-8 pt-2">
            <button
              onClick={() => {
                setShadeOpen(false);
                openApp("settings");
              }}
              aria-label="Open Settings"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <Settings className="h-4.5 w-4.5 text-white/85" />
            </button>
            <button onClick={() => setShadeOpen(false)} className="text-[11px] tracking-widest text-white/50">
              CLOSE
            </button>
            <button
              onClick={() => {
                setShadeOpen(false);
                lock();
              }}
              aria-label="Lock phone"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <Power className="h-4.5 w-4.5 text-white/85" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============ recents ============ */

export function Recents({ apps }: { apps: AppDef[] }) {
  const recentsOpen = usePhone((s) => s.recentsOpen);
  const recents = usePhone((s) => s.recents);
  const openApp = usePhone((s) => s.openApp);
  const removeRecent = usePhone((s) => s.removeRecent);
  const clearRecents = usePhone((s) => s.clearRecents);
  const setRecentsOpen = usePhone((s) => s.setRecentsOpen);

  const list = recents.map((id) => apps.find((a) => a.id === id)).filter(Boolean) as AppDef[];

  return (
    <AnimatePresence>
      {recentsOpen && (
        <motion.div
          key="recents"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-xl"
          onClick={() => setRecentsOpen(false)}
        >
          <p className="pt-10 text-center text-xs font-semibold uppercase tracking-widest text-white/50">
            Recent apps
          </p>
          {list.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-white/40">No recent apps</p>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-4 overflow-x-auto px-8 no-scrollbar" onClick={(e) => e.stopPropagation()}>
              {list.map((app) => (
                <motion.div
                  key={app.id}
                  layout
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative shrink-0"
                >
                  <button
                    onClick={() => openApp(app.id)}
                    className={`flex h-[340px] w-[210px] flex-col overflow-hidden rounded-3xl bg-gradient-to-br ${app.gradient} p-4 text-left shadow-2xl ring-1 ring-white/20 transition hover:scale-[1.03]`}
                  >
                    <div className="flex items-center gap-2">
                      <app.icon className="h-4 w-4 text-white/90" />
                      <span className="text-xs font-semibold text-white/95">{app.name}</span>
                    </div>
                    <div className="mt-auto flex justify-center pb-2">
                      <app.icon className="h-20 w-20 text-white/30" />
                    </div>
                  </button>
                  <button
                    aria-label={`Close ${app.name}`}
                    onClick={() => removeRecent(app.id)}
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-white/90 ring-1 ring-white/20 transition hover:bg-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
          {list.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearRecents();
              }}
              className="mx-auto mb-10 rounded-full bg-white/15 px-5 py-2 text-xs font-medium text-white/90 backdrop-blur transition hover:bg-white/25"
            >
              Clear all
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============ toast ============ */

export function PhoneToast() {
  const toast = usePhone((s) => s.toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="pointer-events-none absolute bottom-12 left-1/2 z-[65] max-w-[85%] -translate-x-1/2 rounded-full bg-zinc-900/95 px-4 py-2.5 text-xs font-medium text-white shadow-xl ring-1 ring-white/15"
        >
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============ dialog primitives ============ */

export function PhoneDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[55] flex items-center justify-center bg-black/60 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-3xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/10"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 px-3 pt-2 pb-3">
      <button
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-90"
      >
        <ChevronLeft className="h-5 w-5 text-white/85" />
      </button>
      <h1 className="flex-1 truncate text-lg font-semibold text-white">{title}</h1>
      {right}
    </header>
  );
}
