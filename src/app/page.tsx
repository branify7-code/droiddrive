"use client";

import { useEffect, useState } from "react";
import { Cloud, Smartphone, FolderOpen, ShieldCheck, MousePointerClick } from "lucide-react";
import PhoneRoot from "@/components/phone/PhoneRoot";

const FRAME_W = 434;
const FRAME_H = 914;

function usePhoneScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const s = Math.min(
        (window.innerHeight - 48) / FRAME_H,
        (window.innerWidth - 32) / FRAME_W,
        1
      );
      setScale(Math.max(s, 0.35));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

export default function Home() {
  const scale = usePhoneScale();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070a09] px-4 py-6">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_75%_20%,rgba(16,185,129,0.12),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_15%_85%,rgba(20,184,166,0.10),transparent_70%)]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.04]" aria-hidden>
          <defs>
            <pattern id="bg-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg-grid)" />
        </svg>
      </div>

      {/* side panel (desktop only) */}
      <aside className="relative mr-14 hidden max-w-sm xl:block">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <Smartphone className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">DroidDrive</h1>
            <p className="text-xs text-white/45">Virtual Android phone - cloud storage edition</p>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-white/55">
          A fully interactive Android-style phone interface that runs in your desktop browser. Use
          it like a device: swipe to unlock, open apps, upload files - and connect Google Drive to
          use your cloud quota as the phone&apos;s internal storage.
        </p>
        <ul className="mt-6 space-y-3.5 text-[13px] text-white/70">
          <li className="flex items-start gap-3">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span>
              <b className="text-white/90">Google Drive as phone storage</b> - files upload straight
              to your Drive account; the quota shown is read live from your plan.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
            <span>
              <b className="text-white/90">Real file manager</b> - upload, download, rename, delete,
              create folders; browse photos, play music, take webcam shots.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>
              <b className="text-white/90">Your credentials stay with you</b> - Drive access uses
              client-side OAuth; nothing is proxied or stored by the app.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
            <span>
              <b className="text-white/90">Interactions to try</b> - swipe up on the lock screen, pull
              down the status bar for quick settings, open the app drawer, press Escape for back.
            </span>
          </li>
        </ul>
        <div className="mt-7 rounded-2xl bg-white/[0.05] p-4 text-[11.5px] leading-relaxed text-white/45 ring-1 ring-white/10">
          <b className="text-white/70">First step:</b> open <b className="text-emerald-300">Settings</b> on
          the phone and connect your Google Drive. Setup takes about two minutes with a free OAuth
          Client ID from Google Cloud Console - guided steps are built into the Settings app. Phone
          and Messages apps are simulations; this is a web UI, not an Android OS emulator.
        </div>
      </aside>

      {/* phone */}
      <div
        style={{ width: FRAME_W * scale, height: FRAME_H * scale }}
        className="relative"
        aria-label="Virtual Android phone"
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: FRAME_W,
            height: FRAME_H,
          }}
        >
          {/* bezel */}
          <div className="relative h-full w-full rounded-[54px] bg-gradient-to-b from-zinc-700 via-zinc-900 to-zinc-800 p-[11px] shadow-[0_50px_140px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)]">
            {/* side buttons */}
            <div className="absolute -right-[3px] top-[190px] h-16 w-[3px] rounded-r bg-zinc-600" title="Power" />
            <div className="absolute -right-[3px] top-[280px] h-20 w-[3px] rounded-r bg-zinc-600" title="Volume" />
            <div className="absolute -left-[3px] top-[220px] h-10 w-[3px] rounded-l bg-zinc-600" />
            <PhoneRoot />
          </div>
        </div>
      </div>
    </main>
  );
}
