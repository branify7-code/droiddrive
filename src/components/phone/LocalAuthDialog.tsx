"use client";

import { useEffect, useState } from "react";
import { Lock, Loader2, X } from "lucide-react";
import { usePhone } from "@/lib/phone-store";

/**
 * Sign-in / bootstrap-registration dialog for the server-side LOCAL storage.
 * Opens automatically when a local API call returns 401; also reachable from
 * Settings. Google Drive mode does not use this — Drive auth is OAuth only.
 */
export default function LocalAuthDialog() {
  const open = usePhone((s) => s.localAuthNeeded);
  const showToast = usePhone((s) => s.showToast);

  const [mode, setMode] = useState<"register" | "login">("login");
  const [checked, setChecked] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChecked(false);
    setError(null);
    setUsername("");
    setPassword("");
    setConfirm("");
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: { user: { username: string } | null; hasUsers: boolean }) => {
        setMode(d.hasUsers ? "login" : "register");
        setChecked(true);
      })
      .catch(() => {
        setMode("login");
        setChecked(true);
      });
  }, [open]);

  if (!open || !checked) return null;

  const submit = async () => {
    setError(null);
    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Authentication failed (${res.status})`);
        return;
      }
      usePhone.getState().localAuthResolved(data.user.username, data.adoptedFiles);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    usePhone.setState({ localAuthNeeded: false });
    showToast("Local storage stays locked until you sign in");
  };

  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div className="w-full rounded-3xl bg-zinc-900 p-5 ring-1 ring-white/15">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/20">
            <Lock className="h-5 w-5 text-teal-300" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">
              {mode === "register" ? "Create local storage account" : "Sign in to local storage"}
            </h2>
            <p className="text-[10.5px] leading-snug text-white/45">
              {mode === "register"
                ? "First account on this server. Existing local files will be adopted into it."
                : "Files on this server are private to your account."}
            </p>
          </div>
          <button onClick={dismiss} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/10">
            <X className="h-4 w-4 text-white/50" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username (3-32 chars)"
            autoComplete="username"
            className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-white outline-none ring-1 ring-white/15 placeholder:text-white/25 focus:ring-teal-400"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Password (8+ chars)" : "Password"}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-white outline-none ring-1 ring-white/15 placeholder:text-white/25 focus:ring-teal-400"
          />
          {mode === "register" && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-white outline-none ring-1 ring-white/15 placeholder:text-white/25 focus:ring-teal-400"
            />
          )}
          {error && <p className="text-[11px] font-medium text-red-300">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 py-2.5 text-xs font-bold text-white transition hover:bg-teal-400 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
          <p className="text-center text-[10px] leading-relaxed text-white/30">
            Stored as a salted scrypt hash. This protects the server&apos;s local
            storage only — Google Drive files stay protected by your Google account.
          </p>
        </div>
      </div>
    </div>
  );
}
