"use client";

import { useState } from "react";
import { TriangleAlert, Trash2, ShieldCheck } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatBytes, formatDate } from "@/lib/format";
import { AppAvatar } from "./apps/PlayStoreApp";
import { PhoneDialog } from "./shell";

/**
 * App info for an APK-installed app. Honest by design: the dialog states
 * plainly that the app's code cannot execute inside this simulated phone.
 */
export default function InstalledAppDialog() {
  const appInfoFor = usePhone((s) => s.appInfoFor);
  const installedApps = usePhone((s) => s.installedApps);
  const setAppInfoFor = usePhone((s) => s.setAppInfoFor);
  const uninstallApp = usePhone((s) => s.uninstallApp);
  const showToast = usePhone((s) => s.showToast);
  const storageMode = usePhone((s) => s.storageMode);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [alsoDeleteApk, setAlsoDeleteApk] = useState(true);
  const [working, setWorking] = useState(false);

  const app = appInfoFor ? installedApps.find((a) => a.packageName === appInfoFor) : undefined;
  const open = !!app;

  const close = () => {
    setAppInfoFor(null);
    setConfirmUninstall(false);
  };

  const doUninstall = async () => {
    if (!app) return;
    setWorking(true);
    try {
      await uninstallApp(app.packageName, alsoDeleteApk);
      showToast(`${app.label} uninstalled`);
      close();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Uninstall failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <PhoneDialog open={open} onClose={close}>
      {app && (
        <div className="w-full max-w-[320px] rounded-3xl bg-zinc-900 p-5 ring-1 ring-white/15">
          {confirmUninstall ? (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Trash2 className="h-4 w-4 text-red-400" /> Uninstall {app.label}?
              </h3>
              <p className="mt-2 text-[11.5px] leading-relaxed text-white/55">
                The app will be removed from this phone&apos;s app list.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[11px] text-white/70">
                <input
                  type="checkbox"
                  checked={alsoDeleteApk}
                  onChange={(e) => setAlsoDeleteApk(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                Also delete the APK file ({formatBytes(app.sizeBytes)}) from{" "}
                {storageMode === "drive" ? "Google Drive" : "local storage"}
              </label>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirmUninstall(false)}
                  className="flex-1 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void doUninstall()}
                  disabled={working}
                  className="flex-1 rounded-xl bg-red-500/90 py-2.5 text-[11px] font-bold text-white transition hover:bg-red-500 disabled:opacity-40"
                >
                  {working ? "Removing…" : "Uninstall"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <AppAvatar app={app} size={48} />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{app.label}</h3>
                  <p className="truncate font-mono text-[10px] text-white/45">{app.packageName}</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-amber-500/10 p-3 ring-1 ring-amber-400/25">
                <p className="flex items-start gap-2 text-[10px] leading-relaxed text-amber-100/85">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Simulation notice — this app is installed and managed here, but its code cannot
                  run: a browser tab has no Android system. The APK file stays safely stored
                  {storageMode === "drive" ? " in your Google Drive" : " in local storage"}.
                </p>
              </div>

              <dl className="mt-3 space-y-1.5 text-[11px]">
                {[
                  ["Version", `${app.versionName || "?"} (${app.versionCode})`],
                  ["Size", formatBytes(app.sizeBytes)],
                  ["Installed", formatDate(new Date(app.installedAt).toISOString())],
                  ["Min SDK", app.minSdk != null ? `Android ${app.minSdk}` : "—"],
                  ["Target SDK", app.targetSdk != null ? `Android ${app.targetSdk}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-white/5 py-1.5 last:border-0">
                    <dt className="text-white/45">{k}</dt>
                    <dd className="text-right font-medium text-white/80">{v}</dd>
                  </div>
                ))}
              </dl>

              {app.permissions.length > 0 && (
                <div className="mt-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    {app.permissions.length} permission{app.permissions.length === 1 ? "" : "s"} (from manifest)
                  </p>
                  <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto rounded-xl bg-black/30 p-2.5 phone-scroll">
                    {app.permissions.map((p) => (
                      <li key={p} className="break-all font-mono text-[9.5px] leading-snug text-white/55">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirmUninstall(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/15 py-2.5 text-[11px] font-bold text-red-300 transition hover:bg-red-500/25"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Uninstall
                </button>
                <button
                  onClick={close}
                  className="flex-1 rounded-xl bg-white/10 py-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </PhoneDialog>
  );
}
