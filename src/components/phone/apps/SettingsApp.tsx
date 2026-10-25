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
} from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes } from "@/lib/format";
import { AppHeader } from "../shell";

export default function SettingsApp() {
  const storageMode = usePhone((s) => s.storageMode);
  const driveEmail = usePhone((s) => s.driveEmail);
  const driveQuota = usePhone((s) => s.driveQuota);
  const driveConnecting = usePhone((s) => s.driveConnecting);
  const driveClientId = usePhone((s) => s.driveClientId);
  const setDriveClientId = usePhone((s) => s.setDriveClientId);
  const connectDrive = usePhone((s) => s.connectDrive);
  const trySilentReconnect = usePhone((s) => s.trySilentReconnect);
  const disconnectDrive = usePhone((s) => s.disconnectDrive);
  const refreshDriveQuota = usePhone((s) => s.refreshDriveQuota);
  const brightness = usePhone((s) => s.brightness);
  const setBrightness = usePhone((s) => s.setBrightness);
  const showToast = usePhone((s) => s.showToast);

  const [clientIdInput, setClientIdInput] = useState(driveClientId);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localQuota, setLocalQuota] = useState<{ usage: number; limit: number } | null>(null);

  useEffect(() => {
    setClientIdInput(driveClientId);
  }, [driveClientId]);

  useEffect(() => {
    if (storageMode === "local") {
      fetch("/api/storage/quota")
        .then((r) => r.json())
        .then(setLocalQuota)
        .catch(() => {});
    }
  }, [storageMode]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const connected = storageMode === "drive" && !!driveEmail;

  const quota = connected && driveQuota ? driveQuota : localQuota;
  const pct = quota && quota.limit > 0 ? Math.min(100, (quota.usage / quota.limit) * 100) : 0;

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
            <p className="text-[11px] text-white/55">Virtual Android 16 - Cloud Edition</p>
          </div>
        </div>

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
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10.5px] text-white/50">
                    <span>{formatBytes(driveQuota.usage)} used</span>
                    <span className="font-semibold text-emerald-300">{formatBytes(driveQuota.limit)} total</span>
                  </div>
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
                  onClick={disconnectDrive}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/15 py-2.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/25"
                >
                  <LogOut className="h-3.5 w-3.5" /> Disconnect
                </button>
              </div>
              <p className="mt-2.5 text-[10px] leading-relaxed text-white/35">
                All phone files are stored inside the &ldquo;PhoneStorage&rdquo; folder of your Drive.
              </p>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-[11.5px] leading-relaxed text-white/55">
                Use your Google Drive plan (e.g. 5&nbsp;TB) as this phone&apos;s storage. Files you upload
                land in your real Drive and count against your cloud quota.
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
                    <b className="text-white/85">5.</b> Copy the Client ID (ends with .apps.googleusercontent.com) and paste it below.
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

        {/* storage */}
        <section className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-3 pb-3">
            <HardDrive className="h-4.5 w-4.5 text-teal-300" />
            <h2 className="text-[13px] font-semibold text-white">Phone storage</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
              {connected ? "Google Drive" : "Local virtual"}
            </span>
          </div>
          {quota && (
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
        </section>

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
              ["OS version", "Android 16 - Vanilla Web Edition"],
              ["Storage engine", connected ? "Google Drive REST API v3" : "Local Prisma blob store"],
              ["Build number", "DD.2026.10.25.1"],
              ["Kernel", "React 19 - Next.js 16"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-white/5 py-1.5 last:border-0">
                <dt className="text-white/45">{k}</dt>
                <dd className="text-right font-medium text-white/80">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
