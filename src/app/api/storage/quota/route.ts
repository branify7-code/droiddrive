import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LOCAL_LIMIT, requireUser } from "@/lib/storage/server";

export const dynamic = "force-dynamic";

// Local virtual storage capacity (fallback mode when Google Drive is not connected)
const LOCAL_LIMIT_BYTES = LOCAL_LIMIT; // 256 GB

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;

  const agg = await db.vFile.aggregate({
    where: { ownerId: auth.user.id, isFolder: false },
    _sum: { size: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    usage: agg._sum.size ?? 0,
    limit: LOCAL_LIMIT_BYTES,
    files: agg._count._all,
    label: "Virtual device storage",
  });
}
