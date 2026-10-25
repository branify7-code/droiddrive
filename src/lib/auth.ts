import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

/**
 * Minimal session auth for the server-side local storage backend.
 *
 * - Passwords: scrypt with per-user random salt (never stored in clear).
 * - Sessions: random 32-byte token in an HttpOnly cookie (`dd_session`).
 * - Local storage rows are scoped by `ownerId`; orphan rows (created before
 *   auth existed) are adopted by the FIRST registered account, explicitly —
 *   never silently and never deleted.
 */

export const SESSION_COOKIE = "dd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface LocalAuthUser {
  id: string;
  username: string;
}

/* ---------- passwords ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ---------- validation ---------- */

export function validateUsername(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const v = name.trim();
  if (v.length < 3 || v.length > 32) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(v)) return null;
  return v;
}

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return null;
  if (pw.length < 8 || pw.length > 128) return null;
  return pw;
}

/* ---------- file / folder name validation (shared by storage routes) ---------- */

export function validateFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const v = name.trim();
  if (!v || v.length > 255) return null;
  if (v === "." || v === "..") return null;
  // no path separators, no control chars, no null byte
  if (/[/\\]/.test(v)) return null;
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

/* ---------- sessions ---------- */

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.localSession.create({ data: { token, userId, expiresAt } });
  // opportunistic cleanup of expired sessions
  await db.localSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  return { token, expiresAt };
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/** Resolve the authenticated local user from the request cookie, or null. */
export async function getSessionUser(req: Request): Promise<LocalAuthUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const session = await db.localSession.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.localSession.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return { id: session.user.id, username: session.user.username };
}

/** Destroy the caller's session (if any). */
export async function destroySession(req: Request): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.localSession.delete({ where: { token } }).catch(() => {});
}
