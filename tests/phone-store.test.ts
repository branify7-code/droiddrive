/**
 * Store-level tests: Drive-mode provider selection must NEVER silently fall
 * back to server (local) storage; expired sessions are flagged explicitly;
 * account switching bumps the generation counter used for stale-response
 * isolation. Run: bun test tests/phone-store.test.ts
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { usePhone, accountGen, bumpAccountGen, DEFAULT_DRIVE_CLIENT_ID } from "@/lib/phone-store";
import { DriveSessionExpiredError } from "@/lib/storage/types";
import { LocalProvider } from "@/lib/storage/local";
import { DriveProvider } from "@/lib/storage/drive";

describe("provider selection rules", () => {
  beforeEach(() => {
    usePhone.setState({
      storageMode: "local",
      driveToken: null,
      driveExpiry: 0,
      driveRootId: null,
      driveEmail: null,
      driveSessionExpired: false,
      localAuthNeeded: false,
    });
  });

  test("local mode returns the LocalProvider", () => {
    usePhone.setState({ storageMode: "local" });
    const p = usePhone.getState().getProvider();
    expect(p.kind).toBe("local");
    expect(p).toBeInstanceOf(LocalProvider);
  });

  test("Drive mode with a VALID token returns DriveProvider (no fallback)", () => {
    usePhone.setState({
      storageMode: "drive",
      driveToken: "tok",
      driveRootId: "rootid",
      driveExpiry: Date.now() + 60_000,
    });
    const p = usePhone.getState().getProvider();
    expect(p.kind).toBe("drive");
    expect(p).toBeInstanceOf(DriveProvider);
  });

  test("Drive mode with an EXPIRED token throws — never returns LocalProvider", () => {
    usePhone.setState({
      storageMode: "drive",
      driveToken: "tok",
      driveRootId: "rootid",
      driveExpiry: Date.now() - 1000, // expired
    });
    expect(() => usePhone.getState().getProvider()).toThrow(DriveSessionExpiredError);
    const s = usePhone.getState();
    expect(s.storageMode).toBe("drive"); // mode unchanged — no silent switch
    expect(s.driveSessionExpired).toBe(true); // flagged for the reconnect banner
  });

  test("Drive mode with NO token behaves the same (expired/missing)", () => {
    usePhone.setState({ storageMode: "drive", driveToken: null });
    expect(() => usePhone.getState().getProvider()).toThrow(DriveSessionExpiredError);
    expect(usePhone.getState().storageMode).toBe("drive");
    expect(usePhone.getState().driveSessionExpired).toBe(true);
  });

  test("expired Drive error carries the reconnect message", () => {
    usePhone.setState({ storageMode: "drive", driveToken: null });
    try {
      usePhone.getState().getProvider();
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe("Google Drive session expired — reconnect to continue.");
    }
  });
});

describe("account switching / stale request isolation", () => {
  test("accountGen is monotonic", () => {
    const before = accountGen();
    const mid = bumpAccountGen();
    expect(mid).toBe(before + 1);
    expect(accountGen()).toBe(mid);
  });

  test("disconnectDrive clears ALL account-specific state and bumps generation", async () => {
    usePhone.setState({
      storageMode: "drive",
      driveToken: "tok",
      driveRootId: "rootid",
      driveEmail: "user@example.com",
      driveExpiry: Date.now() + 60_000,
      driveSessionExpired: false,
    });
    const genBefore = accountGen();
    usePhone.getState().disconnectDrive();
    const s = usePhone.getState();
    expect(s.storageMode).toBe("local");
    expect(s.driveToken).toBeNull();
    expect(s.driveRootId).toBeNull();
    expect(s.driveEmail).toBeNull();
    expect(s.driveQuota).toBeNull();
    expect(s.driveSessionExpired).toBe(false);
    expect(accountGen()).toBeGreaterThan(genBefore);
  });

  test("connectDrive falls back to the baked-in default Client ID (no consent in tests, so it fails later)", async () => {
    usePhone.setState({ driveClientId: "" });
    // The default Client ID is baked in, so the OLD "no Client ID" validation
    // error must never occur — in a non-browser runtime the GIS call itself
    // fails instead (no popup/token), which is expected here.
    let message = "";
    try {
      await usePhone.getState().connectDrive();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toBe("Enter your Google OAuth Client ID first");
    expect(message.length).toBeGreaterThan(0);
  });

  test("default Client ID is a valid public OAuth client identifier", () => {
    expect(DEFAULT_DRIVE_CLIENT_ID).toMatch(/^[0-9a-z-]+\.apps\.googleusercontent\.com$/);
    expect(DEFAULT_DRIVE_CLIENT_ID).not.toMatch(/secret/i);
    // Fresh store state carries the default so Settings is pre-filled.
    usePhone.setState({ driveClientId: DEFAULT_DRIVE_CLIENT_ID });
    expect(usePhone.getState().driveClientId).toBe(DEFAULT_DRIVE_CLIENT_ID);
  });
});
