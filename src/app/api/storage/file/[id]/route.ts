import { NextResponse } from "next/server";
import { unlink, readFile, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { validateFileName } from "@/lib/auth";
import {
  localStorageDir,
  requireUser,
  badRequest,
  notFound,
  uploadLimitBytes,
  safeBlobPath,
} from "@/lib/storage/server";

export const dynamic = "force-dynamic";

/** Load a row owned by the current user, or null. */
async function ownedFile(id: string, userId: string) {
  return db.vFile.findFirst({ where: { id, ownerId: userId } });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const { id } = await ctx.params;

  const row = await ownedFile(id, auth.user.id);
  if (!row || row.isFolder || !row.blobPath) {
    return notFound("File not found");
  }

  const abs = safeBlobPath(row.blobPath);
  if (!abs) return NextResponse.json({ error: "Blob unavailable" }, { status: 410 });

  try {
    const buf = await readFile(abs);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const headers = new Headers({
      "Content-Type": row.mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=60",
    });
    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(row.name)}"`);
    }
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return NextResponse.json({ error: "Blob missing on disk" }, { status: 410 });
  }
}

async function deleteRecursive(id: string) {
  const children = await db.vFile.findMany({ where: { parentId: id } });
  for (const c of children) {
    await deleteRecursive(c.id);
  }
  const row = await db.vFile.findUnique({ where: { id } });
  if (row?.blobPath) {
    const abs = safeBlobPath(row.blobPath);
    if (abs) await unlink(abs).catch(() => {});
  }
  await db.vFile.delete({ where: { id } }).catch(() => {});
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const { id } = await ctx.params;

  const row = await ownedFile(id, auth.user.id);
  if (!row) return notFound();

  await deleteRecursive(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const name = validateFileName(body?.name);
  if (!name) return badRequest("Invalid name");

  const row = await ownedFile(id, auth.user.id);
  if (!row) return notFound();

  const updated = await db.vFile.update({ where: { id: row.id }, data: { name } });
  return NextResponse.json({
    item: {
      id: updated.id,
      name: updated.name,
      mimeType: updated.mime,
      isFolder: updated.isFolder,
      size: updated.size,
      modifiedTime: updated.updatedAt.toISOString(),
    },
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const { id } = await ctx.params;

  const row = await ownedFile(id, auth.user.id);
  if (!row || row.isFolder || !row.blobPath) {
    return notFound("File not found");
  }

  const text = await req.text();
  if (Buffer.byteLength(text) > uploadLimitBytes()) {
    return NextResponse.json(
      { error: `Content too large (limit ${Math.round(uploadLimitBytes() / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  const abs = safeBlobPath(row.blobPath);
  if (!abs) return NextResponse.json({ error: "Blob unavailable" }, { status: 410 });

  await writeFile(abs, text);
  const updated = await db.vFile.update({
    where: { id: row.id },
    data: { size: Buffer.byteLength(text) },
  });
  return NextResponse.json({
    item: {
      id: updated.id,
      name: updated.name,
      mimeType: updated.mime,
      isFolder: updated.isFolder,
      size: updated.size,
      modifiedTime: updated.updatedAt.toISOString(),
    },
  });
}
