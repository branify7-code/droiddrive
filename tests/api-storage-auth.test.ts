/**
 * Integration tests for the hardened local storage API.
 * Uses a dedicated SQLite test DB and calls route handlers directly
 * (no network, no Next server). Run: bun test tests/api-storage-auth.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const TEST_DIR = mkdtempSync(path.join(tmpdir(), "droiddrive-test-"));
const DB_URL = `file:${path.join(TEST_DIR, "test.db")}`;
const BLOB_DIR = path.join(TEST_DIR, "blobs");

// Must be set BEFORE importing anything that touches Prisma.
process.env.DATABASE_URL = DB_URL;
process.env.LOCAL_STORAGE_DIR = BLOB_DIR;
process.env.LOCAL_UPLOAD_LIMIT_MB = "200";

let listRoute: typeof import("@/app/api/storage/list/route");
let uploadRoute: typeof import("@/app/api/storage/upload/route");
let folderRoute: typeof import("@/app/api/storage/folder/route");
let quotaRoute: typeof import("@/app/api/storage/quota/route");
let fileRoute: typeof import("@/app/api/storage/file/[id]/route");
let registerRoute: typeof import("@/app/api/auth/register/route");
let loginRoute: typeof import("@/app/api/auth/login/route");
let authLib: typeof import("@/lib/auth");
let dbMod: typeof import("@/lib/db");

let cookieA = "";
let cookieB = "";
let userAId = "";
let userBId = "";

function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), cookie } };
}

async function jsonOf(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function cookieToken(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const m = set.match(/dd_session=([^;]+)/);
  if (!m) throw new Error("no session cookie returned");
  return m[1];
}

beforeAll(async () => {
  // Ensure the SQLite file exists before schema initialization on a fresh checkout.
  writeFileSync(path.join(TEST_DIR, "test.db"), "", { flag: "a" });
  execSync("bunx prisma db push --skip-generate", {
    cwd: path.resolve(import.meta.dir, ".."),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });

    listRoute = await import("@/app/api/storage/list/route");
  uploadRoute = await import("@/app/api/storage/upload/route");
  folderRoute = await import("@/app/api/storage/folder/route");
  quotaRoute = await import("@/app/api/storage/quota/route");
  fileRoute = await import("@/app/api/storage/file/[id]/route");
  registerRoute = await import("@/app/api/auth/register/route");
  loginRoute = await import("@/app/api/auth/login/route");
  authLib = await import("@/lib/auth");
  dbMod = await import("@/lib/db");

  // Seed one orphan file (created before auth existed) — must be adopted by
  // the first registered account, explicitly, never deleted.
  await dbMod.db.vFile.create({
    data: { name: "legacy.txt", mime: "text/plain", isFolder: false, size: 5, blobPath: path.join(BLOB_DIR, "legacy-blob") },
  });

  // Bootstrap user A via the register route (also exercises adoption).
  const reg = await registerRoute.POST(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "password123" }),
    })
  );
  expect(reg.status).toBe(200);
  cookieA = `dd_session=${cookieToken(reg)}`;
  const regBody = await jsonOf(reg);
  userAId = regBody.user.id;
  expect(regBody.adoptedFiles).toBeGreaterThanOrEqual(1);

  // User B created directly (bootstrap route only allows the first account).
  const userB = await dbMod.db.localUser.create({
    data: { username: "bob", passwordHash: authLib.hashPassword("password456") },
  });
  userBId = userB.id;
  const login = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "password456" }),
    })
  );
  expect(login.status).toBe(200);
  cookieB = `dd_session=${cookieToken(login)}`;
}, 60000);

afterAll(async () => {
  await dbMod?.db.$disconnect();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/* ---------- unauthenticated access ---------- */

describe("unauthenticated local API access is rejected", () => {
  test("list / quota / folder require auth", async () => {
    expect((await listRoute.GET(new Request("http://localhost/api/storage/list?folderId=root"))).status).toBe(401);
    expect((await quotaRoute.GET(new Request("http://localhost/api/storage/quota"))).status).toBe(401);
    expect(
      (
        await folderRoute.POST(
          new Request("http://localhost/api/storage/folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "x" }),
          })
        )
      ).status
    ).toBe(401);
  });

  test("upload requires auth", async () => {
    const fd = new FormData();
    fd.append("file", new File(["hi"], "hi.txt", { type: "text/plain" }));
    fd.append("folderId", "root");
    const res = await uploadRoute.POST(new Request("http://localhost/api/storage/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });

  test("file GET/PATCH/PUT/DELETE require auth", async () => {
    const ctx = { params: Promise.resolve({ id: "whatever" }) };
    expect((await fileRoute.GET(new Request("http://localhost/api/storage/file/whatever"), ctx)).status).toBe(401);
    expect((await fileRoute.DELETE(new Request("http://localhost/api/storage/file/whatever", { method: "DELETE" }), ctx)).status).toBe(401);
    expect(
      (
        await fileRoute.PATCH(
          new Request("http://localhost/api/storage/file/whatever", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "n" }),
          }),
          ctx
        )
      ).status
    ).toBe(401);
    expect(
      (await fileRoute.PUT(new Request("http://localhost/api/storage/file/whatever", { method: "PUT", body: "x" }), ctx)).status
    ).toBe(401);
  });
});

/* ---------- ownership isolation ---------- */

describe("per-user ownership isolation", () => {
  let aFileId = "";
  let aFolderId = "";

  test("upload without a session cookie is rejected (401)", async () => {
    const fd = new FormData();
    fd.append("file", new File(["hello alice"], "a-note.txt", { type: "text/plain" }));
    fd.append("folderId", "root");
    const res = await uploadRoute.POST(new Request("http://localhost/api/storage/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });

  test("upload with cookie works", async () => {
    const fd = new FormData();
    fd.append("file", new File(["hello alice"], "a-note.txt", { type: "text/plain" }));
    fd.append("folderId", "root");
    const res = await uploadRoute.POST(
      new Request("http://localhost/api/storage/upload", withCookie(cookieA, { method: "POST", body: fd }))
    );
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    aFileId = body.item.id;
    expect(body.item.name).toBe("a-note.txt");
    // MIME given by the caller must be preserved (not rewritten to octet-stream)
    expect(body.item.mimeType).toContain("text/plain");
  });

  test("user A creates a folder", async () => {
    const res = await folderRoute.POST(
      new Request("http://localhost/api/storage/folder", {
        ...withCookie(cookieA, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "a-folder" }),
        }),
      })
    );
    expect(res.status).toBe(200);
    aFolderId = (await jsonOf(res)).item.id;
  });

  test("user B cannot see A's files in list", async () => {
    const res = await listRoute.GET(new Request("http://localhost/api/storage/list?folderId=root"), );
    expect(res.status).toBe(401);
    const resB = await listRoute.GET(new Request("http://localhost/api/storage/list?folderId=root", { headers: { cookie: cookieB } }));
    expect(resB.status).toBe(200);
    const items = (await jsonOf(resB)).items;
    expect(items.find((i: any) => i.id === aFileId)).toBeUndefined();
    expect(items.find((i: any) => i.name === "a-folder")).toBeUndefined();
  });

  test("user B cannot read/update/delete A's file (404, no existence leak)", async () => {
    const ctx = { params: Promise.resolve({ id: aFileId }) };
    const g = await fileRoute.GET(new Request(`http://localhost/api/storage/file/${aFileId}`, { headers: { cookie: cookieB } }), ctx);
    expect(g.status).toBe(404);
    const p = await fileRoute.PATCH(
      new Request(`http://localhost/api/storage/file/${aFileId}`, {
        ...withCookie(cookieB, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "stolen" }) }),
      }),
      ctx
    );
    expect(p.status).toBe(404);
    const u = await fileRoute.PUT(
      new Request(`http://localhost/api/storage/file/${aFileId}`, { ...withCookie(cookieB, { method: "PUT", body: "hacked" }) }),
      ctx
    );
    expect(u.status).toBe(404);
    const d = await fileRoute.DELETE(
      new Request(`http://localhost/api/storage/file/${aFileId}`, { ...withCookie(cookieB, { method: "DELETE" }) }),
      ctx
    );
    expect(d.status).toBe(404);
  });

  test("user B cannot upload into A's folder", async () => {
    const fd = new FormData();
    fd.append("file", new File(["intruder"], "bad.txt", { type: "text/plain" }));
    fd.append("folderId", aFolderId);
    const res = await uploadRoute.POST(
      new Request("http://localhost/api/storage/upload", withCookie(cookieB, { method: "POST", body: fd }))
    );
    expect(res.status).toBe(404);
  });

  test("user B cannot create a folder inside A's folder", async () => {
    const res = await folderRoute.POST(
      new Request("http://localhost/api/storage/folder", {
        ...withCookie(cookieB, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "nested", folderId: aFolderId }),
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  test("quota is scoped to the owner", async () => {
    const resA = await quotaRoute.GET(new Request("http://localhost/api/storage/quota", { headers: { cookie: cookieA } }));
    const a = await jsonOf(resA);
    expect(a.usage).toBeGreaterThanOrEqual(11); // a-note.txt (11 bytes) + adopted legacy (5)
    expect(a.limit).toBe(256 * 1024 * 1024 * 1024);
    const resB = await quotaRoute.GET(new Request("http://localhost/api/storage/quota", { headers: { cookie: cookieB } }));
    const b = await jsonOf(resB);
    expect(b.usage).toBe(0);
  });
});

/* ---------- input validation ---------- */

describe("input validation and limits", () => {
  test("rejects path-like file names", async () => {
    const fd = new FormData();
    fd.append("file", new File(["x"], "../evil.txt", { type: "text/plain" }));
    fd.append("folderId", "root");
    const res = await uploadRoute.POST(
      new Request("http://localhost/api/storage/upload", withCookie(cookieA, { method: "POST", body: fd }))
    );
    expect(res.status).toBe(400);
  });

  test("rejects invalid folder names", async () => {
    for (const bad of ["a/b", "..", "."]) {
      const res = await folderRoute.POST(
        new Request("http://localhost/api/storage/folder", {
          ...withCookie(cookieA, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: bad }),
          }),
        })
      );
      expect(res.status).toBe(400);
    }
  });

  test("enforces the configured upload size limit (413)", async () => {
    process.env.LOCAL_UPLOAD_LIMIT_MB = "1"; // 1 MB
    try {
      const big = new Uint8Array(2 * 1024 * 1024); // 2 MB
      const fd = new FormData();
      fd.append("file", new File([big], "big.bin", { type: "application/octet-stream" }));
      fd.append("folderId", "root");
      const res = await uploadRoute.POST(
        new Request("http://localhost/api/storage/upload", withCookie(cookieA, { method: "POST", body: fd }))
      );
      expect(res.status).toBe(413);
    } finally {
      process.env.LOCAL_UPLOAD_LIMIT_MB = "200";
    }
  });
});

/* ---------- note update (PUT) content preservation ---------- */

describe("note update endpoint preserves exact content", () => {
  let noteId = "";

  test("create note, edit twice, download -> byte-exact content, no duplicates", async () => {
    // create
    const fd = new FormData();
    fd.append("file", new File(["shopping list v1"], "shopping.txt", { type: "text/plain" }));
    fd.append("folderId", "root");
    const created = await uploadRoute.POST(
      new Request("http://localhost/api/storage/upload", withCookie(cookieA, { method: "POST", body: fd }))
    );
    noteId = (await jsonOf(created)).item.id;

    // edit 1
    const v2 = "shopping list v2\n- milk\n- eggs ünïcode ✓";
    const put1 = await fileRoute.PUT(
      new Request(`http://localhost/api/storage/file/${noteId}`, withCookie(cookieA, { method: "PUT", body: v2 })),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(put1.status).toBe(200);

    // edit 2 (update again — still one file)
    const v3 = "shopping list v3\nfinal";
    const put2 = await fileRoute.PUT(
      new Request(`http://localhost/api/storage/file/${noteId}`, withCookie(cookieA, { method: "PUT", body: v3 })),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(put2.status).toBe(200);
    expect((await jsonOf(put2)).item.size).toBe(Buffer.byteLength(v3));

    // download -> exact bytes of the LATEST version
    const got = await fileRoute.GET(
      new Request(`http://localhost/api/storage/file/${noteId}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(got.status).toBe(200);
    expect(await got.text()).toBe(v3);

    // no duplicate rows created by updates
    const listing = await listRoute.GET(
      new Request("http://localhost/api/storage/list?folderId=root", { headers: { cookie: cookieA } })
    );
    const items = (await jsonOf(listing)).items as any[];
    expect(items.filter((i) => i.name === "shopping.txt").length).toBe(1);
  });

  test("PUT rejects oversized content with 413", async () => {
    process.env.LOCAL_UPLOAD_LIMIT_MB = "1";
    try {
      const res = await fileRoute.PUT(
        new Request(`http://localhost/api/storage/file/${noteId}`, {
          ...withCookie(cookieA, { method: "PUT", body: "x".repeat(2 * 1024 * 1024) }),
        }),
        { params: Promise.resolve({ id: noteId }) }
      );
      expect(res.status).toBe(413);
    } finally {
      process.env.LOCAL_UPLOAD_LIMIT_MB = "200";
    }
  });

  test("rename works and validates", async () => {
    const ok = await fileRoute.PATCH(
      new Request(`http://localhost/api/storage/file/${noteId}`, {
        ...withCookie(cookieA, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "renamed.txt" }) }),
      }),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(ok.status).toBe(200);
    expect((await jsonOf(ok)).item.name).toBe("renamed.txt");

    const bad = await fileRoute.PATCH(
      new Request(`http://localhost/api/storage/file/${noteId}`, {
        ...withCookie(cookieA, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x/y" }) }),
      }),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(bad.status).toBe(400);
  });

  test("delete removes the owner's file; already-deleted is 404", async () => {
    const del = await fileRoute.DELETE(
      new Request(`http://localhost/api/storage/file/${noteId}`, { ...withCookie(cookieA, { method: "DELETE" }) }),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(del.status).toBe(200);
    const again = await fileRoute.DELETE(
      new Request(`http://localhost/api/storage/file/${noteId}`, { ...withCookie(cookieA, { method: "DELETE" }) }),
      { params: Promise.resolve({ id: noteId }) }
    );
    expect(again.status).toBe(404);
  });
});

/* ---------- auth flows ---------- */

describe("local auth flows", () => {
  test("second bootstrap registration is rejected", async () => {
    const res = await registerRoute.POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "eve", password: "password789" }),
      })
    );
    expect(res.status).toBe(403);
  });

  test("wrong password rejected; weak inputs rejected", async () => {
    const bad = await loginRoute.POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "wrong-password" }),
      })
    );
    expect(bad.status).toBe(401);

    const weak = await loginRoute.POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "" }),
      })
    );
    expect(weak.status).toBe(400);
  });

  test("orphan files were adopted by the first account, not deleted", async () => {
    const res = await listRoute.GET(
      new Request("http://localhost/api/storage/list?folderId=root", { headers: { cookie: cookieA } })
    );
    const items = (await jsonOf(res)).items as any[];
    expect(items.find((i) => i.name === "legacy.txt")).toBeDefined();
  });
});
