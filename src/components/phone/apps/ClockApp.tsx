"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Timer, Play, Pause, RotateCcw, Flag } from "lucide-react";
import { useNow, fmtDate } from "../shell";
import { twoDigits } from "@/lib/format";

export default function ClockApp() {
  const [tab, setTab] = useState<"clock" | "stopwatch">("clock");
  const now = useNow(500);

  return (
    <div className="flex h-full flex-col pt-12">
      <div className="mx-4 mb-2 flex rounded-2xl bg-white/[0.07] p-1">
        {(["clock", "stopwatch"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold capitalize transition ${
              tab === t ? "bg-emerald-500 text-white shadow" : "text-white/60 hover:text-white"
            }`}
          >
            {t === "clock" ? <Clock3 className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
            {t}
          </button>
        ))}
      </div>
      {tab === "clock" ? <ClockFace now={now} /> : <Stopwatch />}
    </div>
  );
}

function ClockFace({ now }: { now: Date }) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();

  const hourAngle = ((h % 12) + m / 60) * 30;
  const minAngle = (m + s / 60) * 6;
  const secAngle = s * 6;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-16">
      <div className="relative h-52 w-52 rounded-full bg-white/[0.05] ring-1 ring-white/10">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-[84px] w-[2px] origin-top -translate-x-1/2"
            style={{ transform: `translate(-50%,0) rotate(${i * 30}deg)` }}
          >
            <span className={`mx-auto block h-2.5 w-[2px] rounded ${i % 3 === 0 ? "bg-emerald-300" : "bg-white/25"}`} style={{ marginTop: 6 }} />
          </span>
        ))}
        <span className="absolute left-1/2 top-1/2 w-[3.5px] rounded-full bg-white origin-bottom -translate-x-1/2" style={{ height: 62, transform: `translate(-50%,-100%) rotate(${hourAngle}deg)`, transformOrigin: "50% 100%" }} />
        <span className="absolute left-1/2 top-1/2 w-[2.5px] rounded-full bg-white/85 origin-bottom -translate-x-1/2" style={{ height: 88, transform: `translate(-50%,-100%) rotate(${minAngle}deg)`, transformOrigin: "50% 100%" }} />
        <span className="absolute left-1/2 top-1/2 w-[1.5px] rounded-full bg-emerald-400 origin-bottom -translate-x-1/2" style={{ height: 94, transform: `translate(-50%,-100%) rotate(${secAngle}deg)`, transformOrigin: "50% 100%" }} />
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 ring-2 ring-black/40" />
      </div>
      <div className="text-center">
        <p className="text-[34px] font-extralight tracking-wide text-white">
          {twoDigits(h)}:{twoDigits(m)}
          <span className="text-lg text-white/45">:{twoDigits(s)}</span>
        </p>
        <p className="mt-1 text-xs text-white/50">{fmtDate(now)}</p>
      </div>
    </div>
  );
}

function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 33);
    return () => clearInterval(t);
  }, [running]);

  const fmtMs = (ms: number) =>
    `${twoDigits(Math.floor(ms / 60000))}:${twoDigits(Math.floor((ms % 60000) / 1000))}.${Math.floor((ms % 1000) / 10).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-1 flex-col items-center pt-10">
      <div className="rounded-[40px] bg-white/[0.05] px-8 py-6 ring-1 ring-white/10">
        <p className="font-mono text-[40px] font-extralight tabular-nums text-white">{fmtMs(elapsed)}</p>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => {
            if (!running) startRef.current = Date.now() - elapsed;
            setRunning(!running);
          }}
          aria-label={running ? "Pause" : "Start"}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition active:scale-90 ${
            running ? "bg-amber-500 shadow-amber-500/25 hover:bg-amber-400" : "bg-emerald-500 shadow-emerald-500/25 hover:bg-emerald-400"
          }`}
        >
          {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <button
          onClick={() => (running ? setLaps((l) => [elapsed, ...l]) : (setElapsed(0), setLaps([])))}
          aria-label={running ? "Lap" : "Reset"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white/85 transition hover:bg-white/15 active:scale-90"
        >
          {running ? <Flag className="h-4.5 w-4.5" /> : <RotateCcw className="h-4.5 w-4.5" />}
        </button>
      </div>
      <div className="mt-6 w-full flex-1 overflow-y-auto px-6 pb-16 phone-scroll">
        {laps.map((l, i) => (
          <div key={i} className="flex justify-between border-b border-white/5 py-2.5 text-xs">
            <span className="text-white/45">Lap {laps.length - i}</span>
            <span className="font-mono tabular-nums text-white/85">{fmtMs(l - (laps[i + 1] ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
