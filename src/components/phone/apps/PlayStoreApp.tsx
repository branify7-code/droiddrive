"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Package,
  PackageOpen,
  Download,
  Loader2,
  TriangleAlert,
  ExternalLink,
  Trash2,
  Info,
  ShieldCheck,
  HardDrive,
  Search,
  Store as StoreIcon,
} from "lucide-react";
import { usePhone, accountGen } from "@/lib/phone-store";
import { parseApkBlob } from "@/lib/apk";
import type { ApkInfo } from "@/lib/apk";
import type { InstalledApp } from "@/lib/apps-registry";
import { formatBytes } from "@/lib/format";
import { AppHeader } from "../shell";

/**
 * Play Store (simulation) — honest scope:
 * - REAL: APK parsing, storage, install/uninstall/upgrade management.
 * - NOT possible: executing APK code (no Android runtime in a browser) and
 *   downloading from Google Play (no public API; ToS forbids it).
 * The catalog links to F-Droid, a reputable open-source APK source.
 */

interface CatalogEntry {
  name: string;
  pkg: string;
  desc: string;
  url: string;
  size: string;
}

const CATALOG: CatalogEntry[] = [
  {
    name: "KISS Launcher",
    pkg: "fr.neamar.kiss",
    desc: "Ultra-light, fast home screen launcher",
    url: "https://f-droid.org/en/packages/fr.neamar.kiss/",
    size: "~2 MB",
  },
  {
    name: "Markor",
    pkg: "net.gsantner.markor",
    desc: "Markdown notes, to-do lists, editing",
    url: "https://f-droid.org/en/packages/net.gsantner.markor/",
    size: "~9 MB",
  },
  {
    name: "Aegis Authenticator",
    pkg: "com.beemdevelopment.aegis",
    desc: "Two-factor (2FA) verification codes",
    url: "https://f-droid.org/en/packages/com.beemdevelopment.aegis/",
    size: "~6 MB",
  },
  {
    name: "AntennaPod",
    pkg: "de.danoeh.antennapod",
    desc: "Podcast manager and player",
    url: "https://f-droid.org/en/packages/de.danoeh.antennapod/",
    size: "~12 MB",
  },
  {
    name: "K-9 Mail",
    pkg: "com.fsck.k9",
    desc: "Open-source email client",
    url: "https://f-droid.org/en/packages/com.fsck.k9/",
    size: "~10 MB",
  },
  {
    name: "Fossify Calendar",
    pkg: "org.fossify.calendar",
    desc: "Events, reminders and widgets",
    url: "https://f-droid.org/en/packages/org.fossify.calendar/",
    size: "~5 MB",
  },
];

type Tab = "store" | "apps" | "install";

export default function PlayStoreApp() {
  const [tab, setTab] = useState<Tab>("store");

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        title="Play Store"
        subtitle="Simulation - real APK management, apps are not executed"
        onBack={() => usePhone.getState().closeApp()}
      />

      {/* tabs */}
      <div className="mx-4 mb-3 flex gap-1 rounded-full bg-white/[0.07] p-1 ring-1 ring-white/10">
        {(
          [
            ["store", "Store", StoreIcon],
            ["apps", "My apps", PackageOpen],
            ["install", "Install APK", Download],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[11px] font-semibold transition ${
              tab === id ? "bg-emerald-500 text-white shadow" : "text-white/60 hover:bg-white/10"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "store" && <StoreTab />}
      {tab === "apps" && <MyAppsTab onInstall={() => setTab("install")} />}
      {tab === "install" && <InstallTab onInstalled={() => setTab("apps")} />}
    </div>
  );
}

/* ================= Store tab ================= */

function StoreTab() {
  const showToast = usePhone((s) => s.showToast);
  const [query, setQuery] = useState("");

  const filtered = CATALOG.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.pkg.toLowerCase().includes(query.toLowerCase())
  );

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Opened the app page - download the APK, then use Install APK");
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-16 phone-scroll">
      {/* honesty banner */}
      <div className="rounded-2xl bg-amber-500/10 p-3.5 ring-1 ring-amber-400/25">
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-[10.5px] leading-relaxed text-amber-100/80">
            Google Play has no public download API, so apps can&apos;t be fetched from it here.
            The catalog below links to <b>F-Droid</b> (trusted open-source APKs). Download an APK,
            then sideload it in the <b>Install APK</b> tab. Installed apps are managed on this
            phone but their code cannot execute — see App info.
          </p>
        </div>
      </div>

      {/* search (opens real Google Play search) */}
      <div className="mt-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 ring-1 ring-white/10">
        <Search className="h-3.5 w-3.5 text-white/50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search catalog"
          className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
        />
        {query && (
          <button
            onClick={() =>
              openUrl(`https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`)
            }
            className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[9.5px] font-semibold text-emerald-300 transition hover:bg-white/20"
          >
            Search on Google Play ↗
          </button>
        )}
      </div>

      <p className="mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
        Open-source picks (F-Droid)
      </p>
      <ul className="mt-2 space-y-2">
        {filtered.map((entry) => (
          <li
            key={entry.pkg}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-teal-500/20 ring-1 ring-white/10">
              <Package className="h-5 w-5 text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-white/90">{entry.name}</span>
              <span className="block truncate text-[10px] text-white/45">{entry.desc}</span>
              <span className="mt-0.5 block truncate font-mono text-[9px] text-white/30">
                {entry.pkg} - {entry.size}
              </span>
            </span>
            <button
              onClick={() => openUrl(entry.url)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-2 text-[10.5px] font-bold text-white transition hover:bg-emerald-500 active:scale-95"
            >
              <ExternalLink className="h-3 w-3" /> Get APK
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="pt-6 text-center text-xs text-white/40">No catalog apps match your search</li>
        )}
      </ul>

      <p className="mt-4 px-1 text-[9.5px] leading-relaxed text-white/30">
        Catalog links open f-droid.org in a real browser tab. Only sideload APKs from sources you
        trust — permissions are shown before installing.
      </p>
    </div>
  );
}

/* ================= My apps tab ================= */

function MyAppsTab({ onInstall }: { onInstall: () => void }) {
  const installedApps = usePhone((s) => s.installedApps);
  const appsReady = usePhone((s) => s.appsReady);
  const setAppInfoFor = usePhone((s) => s.setAppInfoFor);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-16 phone-scroll">
      {!appsReady ? (
        <div className="flex justify-center pt-10">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      ) : installedApps.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-14 text-center">
          <PackageOpen className="mb-3 h-10 w-10 text-white/15" />
          <p className="text-sm text-white/50">No apps installed</p>
          <p className="mt-1 text-[11px] text-white/35">Install an APK to see it here</p>
          <button
            onClick={onInstall}
            className="mt-4 rounded-full bg-emerald-500/90 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500"
          >
            Install an APK
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {installedApps.map((app) => (
            <li
              key={app.packageName}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"
            >
              <AppAvatar app={app} size={44} />
              <button
                onClick={() => setAppInfoFor(app.packageName)}
                className="min-w-0 flex-1 text-left"
                aria-label={`App info for ${app.label}`}
              >
                <span className="block truncate text-[12.5px] font-semibold text-white/90">{app.label}</span>
                <span className="block truncate text-[10px] text-white/45">
                  v{app.versionName || "?"} ({app.versionCode}) - {formatBytes(app.sizeBytes)}
                </span>
                <span className="block truncate font-mono text-[9px] text-white/30">{app.packageName}</span>
              </button>
              <button
                onClick={() => setAppInfoFor(app.packageName)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
                aria-label="App info"
              >
                <Info className="h-4 w-4 text-white/55" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= Install tab ================= */

type Stage =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "review"; info: ApkInfo; blob: Blob; fileName: string }
  | { kind: "installing"; pct: number }
  | { kind: "error"; message: string };

function InstallTab({ onInstalled }: { onInstalled: () => void }) {
  const getProvider = usePhone((s) => s.getProvider);
  const installApk = usePhone((s) => s.installApk);
  const showToast = usePhone((s) => s.showToast);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genRef = useRef(accountGen());

  const reset = () => setStage({ kind: "idle" });

  const handleFile = useCallback(
    async (file: File | Blob, fileName: string) => {
      genRef.current = accountGen();
      setStage({ kind: "parsing" });
      try {
        const info = await parseApkBlob(file, fileName);
        if (genRef.current !== accountGen()) return;
        setStage({ kind: "review", info, blob: file, fileName });
      } catch (e) {
        if (genRef.current !== accountGen()) return;
        setStage({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not read this APK file",
        });
      }
    },
    []
  );

  const doInstall = async () => {
    if (stage.kind !== "review") return;
    const { info, blob, fileName } = stage;
    setStage({ kind: "installing", pct: 0 });
    try {
      // Probe provider first (throws DriveSessionExpiredError with clear message)
      getProvider();
      const app = await installApk({
        blob,
        fileName,
        info,
        onProgress: (loaded, total) => {
          if (total > 0) setStage({ kind: "installing", pct: Math.round((loaded / total) * 100) });
        },
      });
      showToast(`${app.label} installed`);
      reset();
      onInstalled();
    } catch (e) {
      setStage({
        kind: "error",
        message: e instanceof Error ? e.message : "Installation failed",
      });
    }
  };

  useEffect(() => () => void (genRef.current = -1), []);

  return (
    <div
      className="flex-1 overflow-y-auto px-4 pb-16 phone-scroll"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f, f.name);
      }}
    >
      {stage.kind === "idle" || stage.kind === "parsing" ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? "border-emerald-400 bg-emerald-500/10" : "border-white/20 bg-white/[0.04] hover:bg-white/[0.07]"
          }`}
        >
          {stage.kind === "parsing" ? (
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-emerald-300" />
          ) : (
            <PackageOpen className="mb-3 h-9 w-9 text-white/40" />
          )}
          <p className="text-[13px] font-semibold text-white/85">
            {stage.kind === "parsing" ? "Reading APK…" : "Tap to pick an APK file"}
          </p>
          <p className="mt-1 text-[10.5px] text-white/40">or drag &amp; drop a .apk here</p>
        </button>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f, f.name);
          e.target.value = "";
        }}
      />

      {stage.kind === "review" && <ReviewCard info={stage.info} sizeBytes={stage.blob.size} fileName={stage.fileName} />}

      {stage.kind === "installing" && (
        <div className="mt-3 rounded-2xl bg-white/10 p-3.5">
          <div className="flex justify-between text-[10.5px] text-white/70">
            <span>Installing {stage.pct === 100 ? "(saving app list)…" : "…"}</span>
            <span>{stage.pct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.max(stage.pct, 3)}%` }} />
          </div>
        </div>
      )}

      {stage.kind === "error" && (
        <div className="mt-3 rounded-2xl bg-red-500/10 p-3.5 ring-1 ring-red-400/30">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <p className="text-[11px] leading-relaxed text-red-100/85">{stage.message}</p>
          </div>
          <button
            onClick={reset}
            className="mt-3 w-full rounded-xl bg-white/10 py-2 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
          >
            Try another file
          </button>
        </div>
      )}

      {stage.kind === "review" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={reset}
            className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            onClick={() => void doInstall()}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.98]"
          >
            <Download className="h-3.5 w-3.5" /> Install
          </button>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/10">
        <div className="flex items-start gap-2.5">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
          <p className="text-[10px] leading-relaxed text-white/50">
            The APK file is stored in the <b>APKs</b> folder of your phone storage (Drive when
            connected). Icons, names, versions and permissions are read from the real Android
            manifest. Remember: installed apps do not run — there is no Android system inside a
            browser tab.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= shared pieces ================= */

export function AppAvatar({ app, size = 44 }: { app: InstalledApp; size?: number }) {
  if (app.iconDataUrl) {
    return (
      <img
        src={app.iconDataUrl}
        alt={`${app.label} icon`}
        width={size}
        height={size}
        className="shrink-0 rounded-[12px] bg-white/10 object-contain ring-1 ring-white/10"
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[12px] bg-white/10 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      <Package className="h-5 w-5 text-white/60" />
    </span>
  );
}

export function ReviewCard({
  info,
  sizeBytes,
  fileName,
}: {
  info: ApkInfo;
  sizeBytes: number;
  fileName: string;
}) {
  return (
    <div className="mt-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        {info.iconDataUrl ? (
          <img
            src={info.iconDataUrl}
            alt={`${info.label} icon`}
            width={52}
            height={52}
            className="rounded-[13px] bg-white/10 object-contain ring-1 ring-white/10"
          />
        ) : (
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[13px] bg-white/10 ring-1 ring-white/10">
            <Package className="h-6 w-6 text-white/60" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-white">{info.label}</p>
          <p className="truncate font-mono text-[10px] text-white/45">{info.packageName}</p>
          <p className="mt-0.5 text-[10px] text-white/45">
            v{info.versionName || "?"} ({info.versionCode}) - {formatBytes(sizeBytes)}
          </p>
        </div>
      </div>

      <p className="mt-2.5 truncate text-[9.5px] text-white/30">{fileName}</p>

      {(info.minSdk != null || info.targetSdk != null) && (
        <p className="mt-2 text-[10px] text-white/45">
          Android {info.minSdk ?? "?"} → {info.targetSdk ?? "?"} (min → target SDK)
        </p>
      )}

      {info.permissions.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            {info.permissions.length} permission{info.permissions.length === 1 ? "" : "s"} requested
          </p>
          <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto rounded-xl bg-black/30 p-2.5 phone-scroll">
            {info.permissions.map((p) => (
              <li key={p} className="break-all font-mono text-[9.5px] leading-snug text-white/55">
                {p.replace(/^android\.permission\./, "android.permission.")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-amber-500/10 p-2.5 text-[9.5px] leading-relaxed text-amber-100/75 ring-1 ring-amber-400/20">
        This phone is a browser simulation — the app will be installed and managed (icon, version,
        uninstall) but its code cannot execute.
      </p>
    </div>
  );
}
