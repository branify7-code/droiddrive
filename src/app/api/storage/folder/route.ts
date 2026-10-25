import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateFileName } from "@/lib/auth";
import { requireUser, badRequest, notFound } from "@/lib/storage/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const userId = auth.user.id;

  const body = await req.json().catch(() => null);
  const name = validateFileName(body?.name);
  const folderId = body?.folderId || "root";

  if (!name) {
    return badRequest("Invalid folder name");
  }

  const parentId = folderId === "root" ? null : folderId;
  if (parentId) {
    const parent = await db.vFile.findFirst({
      where: { id: parentId, ownerId: userId },
    });
    if (!parent || !parent.isFolder) {
      return notFound("Parent folder not found");
    }
  }

  const row = await db.vFile.create({
    data: {
      name,
      mime: "application/vnd.droiddrive.folder",
      isFolder: true,
      parentId,
      ownerId: userId,
    },
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
