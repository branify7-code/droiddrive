import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get("folderId") ?? "root";
  const parentId = folderId === "root" ? null : folderId;

  const items = await db.vFile.findMany({
    where: { parentId },
    orderBy: [{ isFolder: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    items: items.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mime,
      isFolder: f.isFolder,
      size: f.size,
      modifiedTime: f.updatedAt.toISOString(),
    })),
  });
}
