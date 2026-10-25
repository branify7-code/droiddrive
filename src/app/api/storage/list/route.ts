import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, notFound } from "@/lib/storage/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const userId = auth.user.id;

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId") ?? "root";
  const parentId = folderId === "root" ? null : folderId;

  if (parentId) {
    const parent = await db.vFile.findFirst({
      where: { id: parentId, ownerId: userId },
    });
    if (!parent || !parent.isFolder) return notFound("Folder not found");
  }

  const items = await db.vFile.findMany({
    where: { parentId, ownerId: userId },
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
