import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, sessionCookieHeader, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  const user = await db.localUser.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);
  return NextResponse.json(
    { user: { id: user.id, username: user.username } },
    { headers: { "Set-Cookie": sessionCookieHeader(token, expiresAt) } }
  );
}
