import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Local virtual storage capacity (fallback mode when Google Drive is not connected)
const LOCAL_LIMIT = 256 * 1024 * 1024 * 1024; // 256 GB

export async function GET() {
  const agg = await db.vFile.aggregate({
    where: { isFolder: false },
    _sum: { size: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    usage: agg._sum.size ?? 0,
    limit: LOCAL_LIMIT,
    files: agg._count._all,
    label: "Virtual device storage",
  });
}
