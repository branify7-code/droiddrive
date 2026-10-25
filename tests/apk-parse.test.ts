/**
 * APK parsing tests against a REAL APK fixture (KISS Launcher from F-Droid).
 * The parse runs in bun via the library's Node path-string mode.
 * Run: bun test tests/apk-parse.test.ts
 */
import { describe, test, expect } from "bun:test";
import path from "path";
import { parseApkSource, normalizeApkParse, normalizeIcon } from "@/lib/apk";

const FIXTURE = path.join(import.meta.dir, "fixtures", "kiss-224.apk");

describe("parseApkSource (real APK fixture)", () => {
  let info: Awaited<ReturnType<typeof parseApkSource>>;

  test("parses without error", async () => {
    info = await parseApkSource(FIXTURE);
    expect(info).toBeDefined();
  });

  test("extracts the real package name", () => {
    expect(info.packageName).toBe("fr.neamar.kiss");
  });

  test("extracts versionName and versionCode", () => {
    expect(info.versionName).toBe("3.26.0");
    expect(info.versionCode).toBe(224);
  });

  test("extracts a label from localized resources", () => {
    expect(info.label.toLowerCase()).toContain("kiss");
  });

  test("extracts permissions from the binary manifest", () => {
    expect(info.permissions.length).toBeGreaterThan(0);
    expect(info.permissions).toContain("android.permission.READ_CONTACTS");
  });

  test("extracts min/target SDK", () => {
    expect(info.minSdk).toBe(21);
    expect(info.targetSdk).toBe(36);
  });

  test("extracts a launcher icon as a PNG data URL", () => {
    expect(info.iconDataUrl).not.toBeNull();
    expect(info.iconDataUrl!.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("normalizeApkParse", () => {
  test("rejects garbage and empty objects", () => {
    expect(normalizeApkParse(null)).toBeNull();
    expect(normalizeApkParse("hello")).toBeNull();
    expect(normalizeApkParse({})).toBeNull();
    expect(normalizeApkParse({ versionName: "1.0" })).toBeNull();
  });

  test("accepts a minimal valid shape and applies defaults", () => {
    const info = normalizeApkParse({
      package: "com.example.app",
      versionCode: "7", // some APKs encode these as strings
      versionName: "1.2.3",
      usesPermissions: [{ name: "android.permission.INTERNET" }, "android.permission.VIBRATE"],
    });
    expect(info).not.toBeNull();
    expect(info!.packageName).toBe("com.example.app");
    expect(info!.label).toBe("com.example.app"); // falls back to package name
    expect(info!.versionCode).toBe(7);
    expect(info!.versionName).toBe("1.2.3");
    expect(info!.permissions).toEqual(["android.permission.INTERNET", "android.permission.VIBRATE"]);
    expect(info!.minSdk).toBeNull();
  });

  test("picks the first label from localized arrays", () => {
    const info = normalizeApkParse({
      package: "com.example.app",
      application: { label: ["First Label", "Zweite Beschriftung"] },
    });
    expect(info!.label).toBe("First Label");
  });

  test("caps the permissions list", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `android.permission.P${i}` }));
    const info = normalizeApkParse({ package: "com.example.app", usesPermissions: many });
    expect(info!.permissions.length).toBeLessThanOrEqual(100);
  });
});

describe("normalizeIcon", () => {
  test("keeps small data URLs as-is", async () => {
    const tiny = "data:image/png;base64,iVBORw0KGgo=";
    expect(await normalizeIcon(tiny)).toBe(tiny);
  });

  test("rejects non-image strings and absurd sizes", async () => {
    expect(await normalizeIcon("http://example.com/icon.png")).toBeNull();
    expect(await normalizeIcon("data:image/png;base64," + "A".repeat(3_000_000))).toBeNull();
    expect(await normalizeIcon(undefined)).toBeNull();
  });
});
