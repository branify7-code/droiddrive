import { NextResponse } from "next/server";
import { clearSessionCookieHeader, destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await destroySession(req);
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
