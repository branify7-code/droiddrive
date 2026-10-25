"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  HardDrive,
  Copy,
  Check,
  ChevronDown,
  RefreshCw,
  LogOut,
  Info,
  Sun,
  Smartphone,
  KeyRound,
  Loader2,
  CircleCheck,
  TriangleAlert,
  UserRound,
  RotateCcw,
  Package,
} from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes } from "@/lib/format";
import type { QuotaInfo } from "@/lib/storage/types";
import { AppHeader, PhoneDialog } from "../shell";

export default function SettingsApp() {
  const storageMode = usePhone((s) => s.storageMode);
  const driveEmail = usePhone((s) => s.driveEmail);
  const driveQuota = usePhone((s) => s.driveQuota);
  const driveConnecting = usePhone((s) => s.driveConnecting);
  const driveClientId = usePhone((s) => s.driveClientId);
  const driveSessionExpired = usePhone((s) => s.driveSessionExpired);
  const localUser = usePhone((s) => s.localUser);
  const prefsCorrupted = usePhone((s) => s.prefsCorrupted);
  const installedApps = usePhone((s) => s.installedApps);
  const appsCorrupted = usePhone((s) => s.appsCorrupted);
  const resetCorruptedApps = usePhone((s) => s.resetCorruptedApps);
  const openApp = usePhone((s) => s.openApp);
  const setDriveClientId = usePhone((s) => s.setDriveClientId);
  const connectDrive = usePhone((s) => s.connectDrive);
  const trySilentReconnect = usePhone((s) => s.trySilentReconnect);
  const disconnectDrive = usePhone((s) => s.disconnectDrive);
  const refreshDriveQuota = usePhone((s) => s.refreshDriveQuota);
  const markLocalAuthNeeded = usePhone((s) => s.markLocalAuthNeeded);
  const localSignOut = usePhone((s) => s.localSignOut);
  const resetCorruptedPrefs = usePhone((s) => s.resetCorruptedPrefs);
  const brightness = usePhone((s) => s.brightness);
  const setBrightness = usePhone((s) => s.setBrightness);
  const showToast = usePhone((s) => s.showToast);

  const [clientIdInput, setClientIdInput] = useState(driveClientId);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localQuota, setLocalQuota] = useState<QuotaInfo | null>(null);
  const [confirmLocal, setConfirmLocal] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setClientIdInput(driveClientId);
  }, [driveClientId]);

  useEffect(() => {
    if (storageMode === "local") {
      fetch("/api/storage/quota")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) =>
          setLocalQuota(
            d && typeof d.usage === "number"
              ? { ...d, label: d.label ?? "Virtual device storage" }
              : null
          )
        )
        .catch(() => setLocalQuota(null));
    }
  }, [storageMode, localUser]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const connected = storageMode === "drive" && !!driveEmail && !driveSessionExpired;

  const quota = connected && driveQuota ? driveQuota : localQuota;
  const pct =
    quota && !quota.unlimited && quota.limit > 0
      ? Math.min(100, (quota.usage / quota.limit) * 100)
      : 0;

  const doConnect = async () => {
    try {
      await connectDrive(clientIdInput);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Google Drive connection failed");
    }
  };

  const copyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Copy failed — select the text manually");
    }
  };

  const doResetPrefs = async () => {
    setResetting(true);
    try {
      await resetCorruptedPrefs();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader title="Settings" onBack={() => usePhone.getState().closeApp()} />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-16 phone-scroll">
        {/* profile */}
        <div className="flex items-center gap-3.5 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-600/10 p-4 ring-1 ring-emerald-400/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/30">
            <Smartphone className="h-6 w-6 text-emerald-200" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">DroidDrive VD-1</p>
            <p className="text-[11px] text-white/55">Virtual phone - Android-style web UI</p>
          </div>
        </div>

        {/* Drive session expired banner */}
        {storageMode === "drive" && driveSessionExpired && (
          <div className="rounded-3xl bg-red-500/10 p-4 ring-1 ring-red-400/30">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-red-300" />
              <div className="flex-1">
                <h2 className="text-[13px] font-semibold text-red-200">
                  Google Drive session expired
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-red-100/70">
                  Reconnect to continue using Drive storage. Your unsaved notes and inputs are
                  kept on screen. Local storage is not used automatically — switching to it is a
                  manual action below.
                </p>
                <button
                  onClick={doConnect}
                  disabled={driveConnecting || !clientIdInput.trim()}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/90 px-4 py-2 text-[11px] font-bold text-white transition hover:bg-red-500 disabled:opacity-40"
                >
                  {driveConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                  Reconnect Google Drive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Google Drive section */}
        <section className="overflow-hidden rounded-3xl bg-white/[0.06] ring-1 ring-white/10">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <Cloud className="h-4.5 w-4.5 text-emerald-300" />
            <h2 className="text-[13px] font-semibold text-white">Google Drive storage</h2>
            {connected ? (
              <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <CircleCheck className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50">Not connected</span>
            )}
          </div>

          {connected ? (
            <div className="px-4 pb-4">
              <p className="text-[11px] text-white/60">{driveEmail}</p>
              {driveQuota && (
                <>
                  {!driveQuota.unlimited && driveQuota.limit > 0 ? (
                    <>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[10.5px] text-white/50">
                        <span>{formatBytes(driveQuota.usage)} used</span>
                        <span className="font-semibold text-emerald-300">{formatBytes(driveQuota.limit)} total</span>
                      </div>
                      <p className="mt-1 text-[10px] text-white/35">
                        Total Google account usage. Drive files account for{" "}
                        {formatBytes(driveQuota.usageInDrive ?? driveQuota.usage)}. Available:{" "}
                        {formatBytes(Math.max(0, driveQuota.limit - driveQuota.usage))}.
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-[10.5px] text-white/50">
                      Account usage: {formatBytes(driveQuota.usage)} (Drive:{" "}
                      {formatBytes(driveQuota.usageInDrive ?? driveQuota.usage)}) - no capacity
                      limit reported by Google.
                    </p>
                  )}
                </>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => refreshDriveQuota().catch(() => showToast("Could not refresh quota"))}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
                <button
                  onClick={() => setConfirmLocal(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/15 py-2.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/25"
                >
                  <LogOut className="h-3.5 w-3.5" /> Use local storage
                </button>
              </div>
              <p className="mt-2.5 text-[10px] leading-relaxed text-white/35">
                All phone files are stored inside the &ldquo;PhoneStorage&rdquo; folder of your Drive.
              </p>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-[11.5px] leading-relaxed text-white/55">
                Use your Google Drive plan as this phone&apos;s storage (the quota shown is read
                live from your account). Files you upload land in your real Drive and count
                against your cloud quota.
              </p>

              {/* setup steps */}
              <button
                onClick={() => setStepsOpen((v) => !v)}
                className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-amber-300" /> How to get a Client ID (free, ~2 min)
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${stepsOpen ? "rotate-180" : ""}`} />
              </button>
              {stepsOpen && (
                <ol className="mt-2 space-y-2 rounded-xl bg-black/30 p-3.5 text-[10.5px] leading-relaxed text-white/60">
                  <li>
                    <b className="text-white/85">1.</b> Open <span className="text-emerald-300">console.cloud.google.com</span> and create a project.
                  </li>
                  <li>
                    <b className="text-white/85">2.</b> In &ldquo;APIs &amp; Services &gt; Library&rdquo;, enable the <b className="text-white/85">Google Drive API</b>.
                  </li>
                  <li>
                    <b className="text-white/85">3.</b> Configure the OAuth consent screen (External, add your Google account as a test user).
                  </li>
                  <li>
                    <b className="text-white/85">4.</b> Create credentials &gt; OAuth client ID &gt; Web application, and add this exact origin to
                    &ldquo;Authorized JavaScript origins&rdquo;:
                    <button
                      onClick={copyOrigin}
                      className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 font-mono text-[10px] text-emerald-200 transition hover:bg-white/15"
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{origin}</span>
                      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
                    </button>
                  </li>
                  <li>
                    <b className="text-white/85">5.</b> Copy the Client ID (ends with .apps.googleusercontent.com) and paste it below. Your
                    Client ID is already pre-filled — you normally only need step 4. A Client ID is
                    a public identifier — never enter a client secret or password here.
                  </li>
                </ol>
              )}

              <input
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                className="mt-3 w-full rounded-xl bg-white/10 px-3.5 py-2.5 font-mono text-[11px] text-white outline-none ring-1 ring-white/15 placeholder:text-white/25 focus:ring-emerald-400"
              />
              <button
                onClick={doConnect}
                disabled={driveConnecting || !clientIdInput.trim()}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                {driveConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                {driveConnecting ? "Connecting…" : "Connect Google Drive"}
              </button>
              <button
                onClick={() => trySilentReconnect()}
                className="mt-1.5 w-full py-1 text-[10px] text-white/35 underline-offset-2 hover:underline"
              >
                Try silent reconnect with saved Client ID
              </button>
            </div>
          )}
        </section>

        {/* local storage account */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-2">
            <UserRound className="h-4.5 w-4.5 text-teal-300" />
            <h2 className="text-[13px] font-semibold text-white">Local storage account</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
              {localUser ? localUser : "Signed out"}
            </span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-white/40">
            Server-side virtual storage requires its own account; files are private per user.
          </p>
          <div className="mt-3 flex gap-2">
            {localUser ? (
              <button
                onClick={() => localSignOut()}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() => markLocalAuthNeeded()}
                className="flex-1 rounded-xl bg-teal-500/90 py-2.5 text-[11px] font-bold text-white transition hover:bg-teal-500"
              >
                Sign in / Create account
              </button>
            )}
          </div>
        </section>

        {/* storage */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-3">
            <HardDrive className="h-4.5 w-4.5 text-teal-300" />
            <h2 className="text-[13px] font-semibold text-white">Phone storage</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
              {connected ? "Google Drive" : storageMode === "drive" ? "Drive (expired)" : "Local virtual"}
            </span>
          </div>
          {quota && !quota.unlimited && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${connected ? "bg-gradient-to-r from-emerald-400 to-teal-400" : "bg-teal-400/70"}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-white/50">
                <span>{formatBytes(quota.usage)} used</span>
                <span>{formatBytes(quota.limit)} total</span>
              </div>
            </>
          )}
          {quota && quota.unlimited && (
            <p className="text-[10.5px] text-white/50">
              {formatBytes(quota.usage)} used - no capacity limit reported.
            </p>
          )}
          {!quota && (
            <p className="text-[10.5px] text-white/40">
              {storageMode === "local" && !localUser
                ? "Sign in to the local storage account to see usage."
                : "Usage appears once storage is active."}
            </p>
          )}
        </section>

        {/* installed apps (APK manager) */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-2">
            <Package className="h-4.5 w-4.5 text-lime-300" />
            <h2 className="text-[13px] font-semibold text-white">Apps</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
              {installedApps.length} installed
            </span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-white/40">
            APK files are parsed and stored with their real manifest metadata. Their code cannot
            run on this simulated phone.
          </p>
          <button
            onClick={() => openApp("store")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-lime-500/90 py-2.5 text-[11px] font-bold text-zinc-900 transition hover:bg-lime-400"
          >
            <Package className="h-3.5 w-3.5" /> Open Play Store
          </button>
        </section>

        {/* corrupted settings recovery */}
        {prefsCorrupted && (
          <section className="rounded-3xl bg-amber-500/10 p-4 ring-1 ring-amber-400/30">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-300" />
              <div className="flex-1">
                <h2 className="text-[13px] font-semibold text-amber-200">Saved settings are corrupted</h2>
                <p className="mt-1 text-[10.5px] leading-relaxed text-amber-100/70">
                  The saved preferences file failed validation. Defaults are in use and auto-save
                  is paused so the original file is not overwritten.
                </p>
                <button
                  onClick={doResetPrefs}
                  disabled={resetting}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/90 px-4 py-2 text-[11px] font-bold text-white transition hover:bg-amber-500 disabled:opacity-40"
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {storageMode === "drive" ? "Archive & replace file" : "Clear & start fresh"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* corrupted installed-apps recovery */}
        {appsCorrupted && (
          <section className="rounded-3xl bg-amber-500/10 p-4 ring-1 ring-amber-400/30">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-300" />
              <div className="flex-1">
                <h2 className="text-[13px] font-semibold text-amber-200">Saved app list is corrupted</h2>
                <p className="mt-1 text-[10.5px] leading-relaxed text-amber-100/70">
                  The installed-apps file failed validation. The app list is empty for now and the
                  original file was kept. APK files themselves are untouched.
                </p>
                <button
                  onClick={() => void resetCorruptedApps()}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/90 px-4 py-2 text-[11px] font-bold text-white transition hover:bg-amber-500"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {storageMode === "drive" ? "Archive & replace file" : "Clear & start fresh"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* display */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-3">
            <Sun className="h-4.5 w-4.5 text-amber-300" />
            <h2 className="text-[13px] font-semibold text-white">Display brightness</h2>
            <span className="ml-auto text-[11px] text-white/50">{brightness}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            aria-label="Brightness"
            className="dd-range w-full"
          />
        </section>

        {/* about */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-2">
            <Info className="h-4.5 w-4.5 text-white/60" />
            <h2 className="text-[13px] font-semibold text-white">About phone</h2>
          </div>
          <dl className="space-y-1.5 text-[11px]">
            {[
              ["Model", "DroidDrive VD-1 (virtual)"],
              ["Interface", "Android-style web UI (simulation)"],
              ["Storage engine", connected ? "Google Drive REST API v3" : "Local Prisma blob store"],
              ["Build number", "DD.2026.10.25.2"],
              ["Runtime", "React 19 - Next.js 16"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-white/5 py-1.5 last:border-0">
                <dt className="text-white/45">{k}</dt>
                <dd className="text-right font-medium text-white/80">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-[9.5px] leading-relaxed text-white/30">
            DroidDrive simulates a phone interface in the browser. It does not run Android OS or
            execute APK code — APK files are parsed, stored and managed only. Calls and Messages
            are simulations; Camera uses your real webcam.
          </p>
        </section>
      </div>

      {/* confirm switch to local storage */}
      <PhoneDialog open={confirmLocal} onClose={() => setConfirmLocal(false)}>
        <div className="w-full max-w-[300px] rounded-3xl bg-zinc-900 p-5 ring-1 ring-white/15">
          <h3 className="text-sm font-semibold text-white">Switch to local storage?</h3>
          <p className="mt-2 text-[11.5px] leading-relaxed text-white/55">
            The Drive session will be signed out on this device and phone storage switches to the
            server&apos;s local virtual disk (per-account, requires sign-in). Your Drive files stay
            untouched in Google. You can reconnect at any time.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setConfirmLocal(false)}
              className="flex-1 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirmLocal(false);
                disconnectDrive();
              }}
              className="flex-1 rounded-xl bg-red-500/90 py-2.5 text-[11px] font-bold text-white transition hover:bg-red-500"
            >
              Switch to local
            </button>
          </div>
        </div>
      </PhoneDialog>
    </div>
  );
}
