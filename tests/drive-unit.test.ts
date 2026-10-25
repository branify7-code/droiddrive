/**
 * Unit tests for the Google Drive storage layer — MOCKED (fetch is stubbed).
 * These verify URL construction, pagination and quota mapping.
 * They are NOT live Google API verification. Run: bun test tests/drive-unit.test.ts
 */
import { describe, test, expect, afterEach } from "bun:test";
import {
  DriveProvider,
  parseDriveQuota,
  walkAll,
  WALK_MAX_DEPTH,
} from "@/lib/storage/drive";
import type { StorageItem, StorageProvider } from "@/lib/storage/types";

const originalFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetchJsonResponder(responder: (url: string, init?: RequestInit) => any) {
  globalThis.fetch = (async (url: any, init?: any) => {
    const urlStr = typeof url === "string" ? url : url.url;
    calls.push({ url: urlStr, init });
    const body = responder(urlStr, init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls = [];
});

describe("MOCKED: files.list pagination", () => {
  test("follows nextPageToken across multiple pages", async () => {
    const provider = new DriveProvider("test-token", "root-folder");
    let page = 0;
    mockFetchJsonResponder((url) => {
      page += 1;
      if (page === 1) {
        expect(url).toContain("pageSize=1000");
        return {
          nextPageToken: "PAGE2",
          files: [
            { id: "f1", name: "one.txt", mimeType: "text/plain" },
            { id: "f2", name: "two.txt", mimeType: "text/plain" },
          ],
        };
      }
      // second page must carry the token
      expect(url).toContain("pageToken=PAGE2");
      return {
        files: [
          { id: "f3", name: "three.txt", mimeType: "text/plain" },
          { id: "f4", name: "four.txt", mimeType: "text/plain" },
          { id: "d9", name: "sub", mimeType: "application/vnd.google-apps.folder" },
        ],
      };
    });

    const items = await provider.list("root-folder");
    expect(page).toBe(2);
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.id)).toEqual(["f1", "f2", "f3", "f4", "d9"]);
    expect(items.find((i) => i.id === "d9")?.isFolder).toBe(true);
  });
});

describe("MOCKED: updateContent hits the UPLOAD origin (bug regression)", () => {
  test("PATCH goes to googleapis.com/upload and is never double-prefixed", async () => {
    const provider = new DriveProvider("test-token", "root-folder");
    mockFetchJsonResponder(() => ({ id: "note1", name: "n.txt", mimeType: "text/plain" }));

    await provider.updateContent("note1", "v2 content");

    expect(calls).toHaveLength(1);
    const url = calls[0].url;
    // must be the upload origin…
    expect(url.startsWith("https://www.googleapis.com/upload/drive/v3/files/note1")).toBe(true);
    // …and must NOT contain the old corrupted double-prefix
    expect(url).not.toContain("drive/v3https://");
    expect(url).toContain("uploadType=media");
    expect(calls[0].init?.method).toBe("PATCH");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toContain("text/plain");
  });
});

describe("MOCKED: quota mapping uses real Google values", () => {
  test("account usage vs Drive-only usage vs limit", async () => {
    const provider = new DriveProvider("test-token", "root-folder");
    mockFetchJsonResponder(() => ({
      storageQuota: {
        limit: "5497558138880", // 5 TB plan reported by Google (NOT hardcoded by us)
        usage: "2199023255552", // total account usage (all products)
        usageInDrive: "1099511627776", // Drive-only usage
      },
    }));

    const q = await provider.quota();
    expect(q.usage).toBe(2199023255552); // account-wide
    expect(q.usageInDrive).toBe(1099511627776); // Drive-only
    expect(q.limit).toBe(5497558138880);
    expect(q.unlimited).toBe(false);

    // available space must be computed from TOTAL account usage
    const available = q.limit - q.usage;
    expect(available).toBe(5497558138880 - 2199023255552);
  });

  test("missing limit is treated as unlimited (never a 0-capacity display)", () => {
    const q = parseDriveQuota({});
    expect(q.unlimited).toBe(true);
    expect(q.limit).toBe(0);
    expect(q.usage).toBe(0);

    const q2 = parseDriveQuota({ limit: "0", usage: "123" });
    expect(q2.unlimited).toBe(true);
  });
});

/* ---------- walkAll traversal (fake provider, no network) ---------- */

function makeTreeProvider(depth: number): StorageProvider {
  const item = (id: string, isFolder: boolean): StorageItem => ({
    id,
    name: id,
    mimeType: isFolder ? "application/vnd.google-apps.folder" : "text/plain",
    isFolder,
    size: 1,
    modifiedTime: new Date().toISOString(),
  });
  return {
    kind: "drive",
    rootId: "root",
    list: async (folderId: string) => {
      // chain of folders: root -> c1 -> c2 -> ... plus one file per level
      const parts = folderId.split("_");
      const level = folderId === "root" ? 0 : Number(parts[parts.length - 1]);
      if (level >= depth) return [];
      return [item(`f_${level}`, false), item(`c_${level + 1}`, true)];
    },
    upload: async () => {
      throw new Error("not used");
    },
    download: async () => {
      throw new Error("not used");
    },
    createFolder: async () => {
      throw new Error("not used");
    },
    remove: async () => {},
    rename: async () => {},
    updateContent: async () => {},
    quota: async () => ({ usage: 0, limit: 0, label: "t" }),
    mediaUrl: () => null,
  };
}

describe("walkAll intentional traversal limit", () => {
  test("collects files and reports truncation when the depth cap is hit", async () => {
    let truncatedFired = false;
    const items = await walkAll(makeTreeProvider(WALK_MAX_DEPTH + 4), "root", {
      onTruncated: () => {
        truncatedFired = true;
      },
    });
    expect(truncatedFired).toBe(true);
    // one file per level up to the cap
    expect(items).toHaveLength(WALK_MAX_DEPTH + 1);
  });

  test("no truncation callback for shallow trees", async () => {
    let truncatedFired = false;
    const items = await walkAll(makeTreeProvider(2), "root", {
      onTruncated: () => {
        truncatedFired = true;
      },
    });
    expect(truncatedFired).toBe(false);
    expect(items).toHaveLength(2);
  });
});
