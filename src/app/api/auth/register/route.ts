import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createSession,
  hashPassword,
  sessionCookieHeader,
  validatePassword,
  validateUsername,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Bootstrap registration — only allowed while NO local account exists.
 * The first account explicitly adopts pre-auth files (count is returned so
 * the UI can surface it); nothing is migrated or deleted silently.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = validateUsername(body?.username);
  const password = validatePassword(body?.password);

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username must be 3-32 chars (letters, digits, . _ -) and password at least 8 chars" },
      { status: 400 }
    );
  }

  const existingCount = await db.localUser.count();
  if (existingCount > 0) {
    return NextResponse.json(
      { error: "An account already exists on this server. Sign in instead." },
      { status: 403 }
    );
  }

  const taken = await db.localUser.findUnique({ where: { username } });
  if (taken) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const user = await db.localUser.create({
    data: { username, passwordHash: hashPassword(password) },
  });

  // Explicit one-time adoption of files created before auth existed.
  const adopted = await db.vFile.updateMany({
    where: { ownerId: null },
    data: { ownerId: user.id },
  });

  const { token, expiresAt } = await createSession(user.id);

  return NextResponse.json(
    {
      user: { id: user.id, username: user.username },
      adoptedFiles: adopted.count,
    },
    { headers: { "Set-Cookie": sessionCookieHeader(token, expiresAt) } }
  );
}
