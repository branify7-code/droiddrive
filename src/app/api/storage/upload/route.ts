import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { validateFileName } from "@/lib/auth";
import {
  localStorageDir,
  requireUser,
  badRequest,
  notFound,
  uploadLimitBytes,
} from "@/lib/storage/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const userId = auth.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart/form-data");
  }

  const file = form.get("file");
  const folderId = (form.get("folderId") as string) || "root";

  if (!(file instanceof File)) {
    return badRequest("No file provided");
  }

  const name = validateFileName(file.name || "untitled");
  if (!name) return badRequest("Invalid file name");

  if (file.size > uploadLimitBytes()) {
    return NextResponse.json(
      { error: `File too large (limit ${Math.round(uploadLimitBytes() / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  const parentId = folderId === "root" ? null : folderId;
  if (parentId) {
    const parent = await db.vFile.findFirst({
      where: { id: parentId, ownerId: userId },
    });
    if (!parent || !parent.isFolder) {
      return notFound("Folder not found");
    }
  }

  const dir = localStorageDir();
  await mkdir(dir, { recursive: true });

  const blobId = randomUUID();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > uploadLimitBytes()) {
    return NextResponse.json(
      { error: `File too large (limit ${Math.round(uploadLimitBytes() / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }
  const blobPath = path.join(dir, blobId);
  await writeFile(blobPath, buf);

  const row = await db.vFile.create({
    data: {
      id: blobId,
      name,
      mime: file.type || "application/octet-stream",
      isFolder: false,
      parentId,
      size: buf.length,
      blobPath,
      ownerId: userId,
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
}
