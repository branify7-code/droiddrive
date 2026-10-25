"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, Search, Cloud, HardDrive, X } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes } from "@/lib/format";
import { APPS } from "./apps/registry";
import type { AppDef } from "./apps/registry";
import { useNow, fmtTime, fmtDate } from "./shell";

/* ---------- app icon ---------- */

export function AppIcon({ app, onClick, showLabel = true }: { app: AppDef; onClick?: () => void; showLabel?: boolean }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1.5" aria-label={`Open ${app.name}`}>
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-[19px] bg-gradient-to-br ${app.gradient} shadow-lg shadow-black/30 ring-1 ring-white/15 transition group-hover:brightness-110 group-active:scale-90`}
      >
        <app.icon className="h-6 w-6 text-white drop-shadow" />
      </span>
      {showLabel && <span className="text-[10.5px] font-medium text-white/90 drop-shadow">{app.name}</span>}
    </button>
  );
}

/* ---------- storage summary for widget ---------- */

function StorageLine() {
  const storageMode = usePhone((s) => s.storageMode);
  const driveQuota = usePhone((s) => s.driveQuota);
  const driveEmail = usePhone((s) => s.driveEmail);
  const localUser = usePhone((s) => s.localUser);
  const storageEpoch = usePhone((s) => s.storageEpoch);
  const [local, setLocal] = useState<{ usage: number; limit: number } | null>(null);

  useEffect(() => {
    if (storageMode === "local") {
      fetch("/api/storage/quota")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setLocal(d && typeof d.usage === "number" ? d : null))
        .catch(() => {});
    }
  }, [storageMode, storageEpoch, localUser]);

  if (storageMode === "drive") {
    const q = driveQuota;
    const usageText = q
      ? q.unlimited
        ? `${formatBytes(q.usage)} used`
        : `${formatBytes(q.usage)} of ${formatBytes(q.limit)} used`
      : "connected";
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/70">
        <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="min-w-0 truncate">
          Drive{driveEmail ? ` - ${driveEmail}` : ""} - {usageText}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[11px] text-white/60">
      <HardDrive className="h-3.5 w-3.5 shrink-0 text-white/50" />
      <span className="min-w-0 truncate">
        {localUser
          ? local
            ? `${formatBytes(local.usage)} of ${formatBytes(local.limit)} used`
            : "Local storage"
          : "Local storage locked - sign in"}
        {" - connect Drive in Settings"}
      </span>
    </div>
  );
}

/* ---------- home screen ---------- */

export function HomeScreen() {
  const openApp = usePhone((s) => s.openApp);
  const setDrawerOpen = usePhone((s) => s.setDrawerOpen);
  const now = useNow(5000);

  const homeApps = useMemo(() => APPS.filter((a) => a.home), []);
  const dockApps = useMemo(() => APPS.filter((a) => a.dock), []);

  return (
    <div className="absolute inset-0 flex flex-col pt-8 text-white">
      {/* clock + storage widget */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mx-4 mt-3 rounded-3xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm"
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[34px] font-extralight leading-none tracking-tight">{fmtTime(now)}</p>
            <p className="mt-1.5 text-[11px] text-white/55">{fmtDate(now)}</p>
          </div>
          <button
            onClick={() => openApp("settings")}
            className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
          >
            Manage storage
          </button>
        </div>
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <StorageLine />
        </div>
      </motion.div>

      {/* app grid */}
      <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-5 px-4">
        {homeApps.map((app, i) => (
          <motion.div
            key={app.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.06 + i * 0.035 }}
            className="flex justify-center"
          >
            <AppIcon app={app} onClick={() => openApp(app.id)} />
          </motion.div>
        ))}
      </div>

      <div className="flex-1" />

      {/* drawer handle */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open app drawer"
        className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 active:scale-90"
      >
        <ChevronUp className="h-4 w-4 text-white/85" />
      </button>

      {/* dock */}
      <div className="mx-3 mb-9 flex items-center justify-around rounded-[26px] bg-white/[0.09] px-2 py-3 ring-1 ring-white/10 backdrop-blur-md">
        {dockApps.map((app) => (
          <AppIcon key={app.id} app={app} onClick={() => openApp(app.id)} showLabel={false} />
        ))}
      </div>
    </div>
  );
}

/* ---------- app drawer ---------- */

export function AppDrawer() {
  const drawerOpen = usePhone((s) => s.drawerOpen);
  const setDrawerOpen = usePhone((s) => s.setDrawerOpen);
  const openApp = usePhone((s) => s.openApp);
  const [query, setQuery] = useState("");

  const filtered = APPS.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          key="drawer"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute inset-0 z-[45] flex flex-col bg-black/70 pt-10 backdrop-blur-2xl"
        >
          <div className="mx-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 ring-1 ring-white/10">
            <Search className="h-3.5 w-3.5 text-white/50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps"
              className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-3.5 w-3.5 text-white/50" />
              </button>
            )}
          </div>

          <div className="mt-6 grid flex-1 grid-cols-4 content-start gap-x-2 gap-y-5 overflow-y-auto px-4 pb-20 no-scrollbar">
            {filtered.map((app, i) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex justify-center"
              >
                <AppIcon
                  app={app}
                  onClick={() => {
                    openApp(app.id);
                    setQuery("");
                  }}
                />
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-4 pt-10 text-center text-xs text-white/40">No apps match your search</p>
            )}
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            className="mx-auto mb-9 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            aria-label="Close app drawer"
          >
            <ChevronUp className="h-4 w-4 rotate-180 text-white/85" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
