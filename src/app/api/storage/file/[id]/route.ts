import { NextRequest, NextResponse } from "next/server";
import { unlink, readFile, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const download = req.nextUrl.searchParams.get("download") === "1";

  const row = await db.vFile.findUnique({ where: { id } });
  if (!row || row.isFolder || !row.blobPath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buf = await readFile(row.blobPath!);
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
    await unlink(path.resolve(row.blobPath)).catch(() => {});
  }
  await db.vFile.delete({ where: { id } }).catch(() => {});
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.vFile.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteRecursive(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const row = await db.vFile.update({ where: { id }, data: { name: String(body.name) } });
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

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.vFile.findUnique({ where: { id } });
  if (!row || row.isFolder || !row.blobPath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const text = await req.text();
  await writeFile(path.resolve(row.blobPath), text);
  const updated = await db.vFile.update({ where: { id }, data: { size: Buffer.byteLength(text) } });
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


