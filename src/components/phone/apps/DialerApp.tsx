"use client";

import { useState } from "react";
import { Phone, Delete, PhoneOff } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { AppHeader } from "../shell";

const KEYS = [
  { d: "1", sub: "" },
  { d: "2", sub: "ABC" },
  { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" },
  { d: "5", sub: "JKL" },
  { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" },
  { d: "8", sub: "TUV" },
  { d: "9", sub: "WXYZ" },
  { d: "*", sub: "" },
  { d: "0", sub: "+" },
  { d: "#", sub: "" },
];

export default function DialerApp() {
  const [num, setNum] = useState("");
  const [calling, setCalling] = useState(false);
  const showToast = usePhone((s) => s.showToast);

  const call = () => {
    if (!num) return;
    setCalling(true);
    setTimeout(() => {
      setCalling(false);
      showToast(`Call with ${num} ended`);
    }, 2500);
  };

  return (
    <div className="relative flex h-full flex-col">
      <AppHeader title="Phone" onBack={() => usePhone.getState().closeApp()} />

      <div className="flex flex-1 flex-col items-center justify-end px-8 pb-2">
        <p className="min-h-[44px] text-center text-[30px] font-light tracking-wide text-white">{num || <span className="text-white/25">Enter number</span>}</p>
      </div>

      <div className="mx-auto grid w-64 grid-cols-3 gap-3 px-2">
        {KEYS.map((k) => (
          <button
            key={k.d}
            onClick={() => setNum((n) => (n.length < 16 ? n + k.d : n))}
            className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white/[0.08] transition hover:bg-white/[0.16] active:scale-90"
          >
            <span className="text-lg font-medium leading-none text-white">{k.d}</span>
            {k.sub && <span className="mt-0.5 text-[8px] tracking-widest text-white/45">{k.sub}</span>}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-6 pb-16 pt-4">
        <span className="w-14" />
        <button
          onClick={call}
          disabled={!num}
          aria-label="Call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-90 disabled:opacity-30"
        >
          <Phone className="h-6 w-6" />
        </button>
        <button
          onClick={() => setNum((n) => n.slice(0, -1))}
          aria-label="Backspace"
          className="flex h-14 w-14 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 active:scale-90"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      {calling && (
        <div className="absolute inset-0 z-[59] flex flex-col items-center justify-center bg-black/85 backdrop-blur">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/20">
            <Phone className="h-10 w-10 animate-pulse text-emerald-300" />
          </div>
          <p className="mt-6 text-2xl font-light text-white">{num}</p>
          <p className="mt-1 text-xs tracking-widest text-white/50">CALLING…</p>
          <button
            onClick={() => setCalling(false)}
            aria-label="End call"
            className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-xl transition hover:bg-red-400 active:scale-90"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
