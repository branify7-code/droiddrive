import { NextResponse } from "next/server";
import path from "path";
import { getSessionUser, type LocalAuthUser } from "@/lib/auth";

/**
 * Shared server-side helpers for the local (fallback) storage API.
 * Every route requires an authenticated session and scopes all reads/writes
 * to the caller's own rows via `ownerId`.
 */

export const LOCAL_LIMIT = 256 * 1024 * 1024 * 1024; // 256 GB virtual cap
export const DEFAULT_UPLOAD_LIMIT_MB = 200;

/** Configurable blob directory (portable default relative to the project). */
export function localStorageDir(): string {
  const configured = process.env.LOCAL_STORAGE_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(process.cwd(), "db", "vstorage");
}

export function uploadLimitBytes(): number {
  const raw = Number(process.env.LOCAL_UPLOAD_LIMIT_MB ?? DEFAULT_UPLOAD_LIMIT_MB);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UPLOAD_LIMIT_MB;
  return mb * 1024 * 1024;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Authentication required", code: "AUTH_REQUIRED" },
    { status: 401 }
  );
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export type AuthUser = LocalAuthUser;

/** Returns the authenticated user or a 401 response. */
export async function requireUser(
  req: Request
): Promise<{ user: AuthUser; res?: never } | { user?: never; res: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) return { res: unauthorizedResponse() };
  return { user };
}

/** Guard against DB-claimed blob paths escaping the storage directory. */
export function safeBlobPath(blobPath: string): string | null {
  const abs = path.resolve(blobPath);
  const dir = localStorageDir();
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return null;
  return abs;
}
