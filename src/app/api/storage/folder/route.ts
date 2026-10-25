import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const folderId = body?.folderId || "root";

  if (!name) {
    return NextResponse.json({ error: "Folder name required" }, { status: 400 });
  }

  const parentId = folderId === "root" ? null : folderId;
  if (parentId) {
    const parent = await db.vFile.findUnique({ where: { id: parentId } });
    if (!parent || !parent.isFolder) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  const row = await db.vFile.create({
    data: { name, mime: "application/vnd.droiddrive.folder", isFolder: true, parentId },
  });

  return NextResponse.json({
    item: {
      id: row.id,
      name: row.name,
      mimeType: row.mime,
      isFolder: row.isFolder,
      size: 0,
      modifiedTime: row.updatedAt.toISOString(),
    },
  });
}
