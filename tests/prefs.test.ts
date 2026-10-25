/**
 * Unit tests for phone preference validation and the store's provider
 * selection rules (Drive expiry, no silent fallback, account switching).
 * Run: bun test tests/prefs.test.ts tests/phone-store.test.ts
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { validatePrefs, parsePrefsJson, defaultPrefs, PREFS_VERSION } from "@/lib/prefs";

describe("settings JSON validation", () => {
  test("accepts a valid prefs object", () => {
    const prefs = {
      version: PREFS_VERSION,
      brightness: 70,
      toggles: { wifi: true, bt: false, dnd: true, airplane: false },
    };
    expect(validatePrefs(prefs)).toEqual(prefs);
  });

  test("rejects wrong version", () => {
    expect(validatePrefs({ ...defaultPrefs(), version: 99 })).toBeNull();
  });

  test("rejects out-of-range or non-integer brightness", () => {
    expect(validatePrefs({ ...defaultPrefs(), brightness: 10 })).toBeNull();
    expect(validatePrefs({ ...defaultPrefs(), brightness: 150 })).toBeNull();
    expect(validatePrefs({ ...defaultPrefs(), brightness: 55.5 })).toBeNull();
    expect(validatePrefs({ ...defaultPrefs(), brightness: "70" })).toBeNull();
  });

  test("rejects missing or non-boolean toggles", () => {
    expect(validatePrefs({ version: 1, brightness: 80, toggles: { wifi: true } })).toBeNull();
    expect(
      validatePrefs({ version: 1, brightness: 80, toggles: { wifi: 1, bt: false, dnd: false, airplane: false } })
    ).toBeNull();
  });

  test("rejects non-object payloads", () => {
    expect(validatePrefs(null)).toBeNull();
    expect(validatePrefs("json")).toBeNull();
    expect(validatePrefs([1, 2])).toBeNull();
  });

  test("parsePrefsJson flags corrupted files without throwing", () => {
    expect(parsePrefsJson("{not json")).toEqual({ prefs: null, corrupted: true });
    expect(parsePrefsJson(JSON.stringify({ version: 1 }))).toEqual({ prefs: null, corrupted: true });
    expect(parsePrefsJson(JSON.stringify(defaultPrefs())).corrupted).toBe(false);
  });
});
