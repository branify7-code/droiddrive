import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STORAGE_DIR = "/home/z/my-project/db/vstorage";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const folderId = (form.get("folderId") as string) || "root";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const parentId = folderId === "root" ? null : folderId;
    if (parentId) {
      const parent = await db.vFile.findUnique({ where: { id: parentId } });
      if (!parent || !parent.isFolder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    await mkdir(STORAGE_DIR, { recursive: true });

    const blobId = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    const blobPath = path.join(STORAGE_DIR, blobId);
    await writeFile(blobPath, buf);

    const row = await db.vFile.create({
      data: {
        id: blobId,
        name: file.name || "untitled",
        mime: file.type || "application/octet-stream",
        isFolder: false,
        parentId,
        size: buf.length,
        blobPath,
      },
    });

    return NextResponse.json({
      item: {
        id: row.id,
        name: row.name,
        mimeType: row.mime,
        isFolder: row.isFolder,
        size: row.size,
        modifiedTime: row.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("upload error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
