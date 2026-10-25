import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Returns the signed-in local user (if any) and whether an account exists. */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  const hasUsers = (await db.localUser.count()) > 0;
  return NextResponse.json({ user, hasUsers });
}
