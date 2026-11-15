import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_KEYS, legacyFromStorage } from "./settings";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** A Map standing in for localStorage (tests run on Node, which has none). */
function fakeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("legacyFromStorage", () => {
  it("reads every value the way 0.4.x wrote it", () => {
    const s = fakeStorage({
      "dash.hotkey": "Alt+N",
      "dash.stayOnTopFullscreen": "1",
      "dash.checkUpdates": "0",
      "dash.dismissedUpdate": "0.5.0",
    });
    expect(legacyFromStorage(s.getItem)).toEqual({
      hotkey: "Alt+N",
      stayOnTopFullscreen: true,
      checkUpdates: false,
      dismissedUpdate: "0.5.0",
    });
  });

  it("leaves out what was never set, so Rust keeps its own value", () => {
    expect(legacyFromStorage(() => null)).toEqual({});
    const s = fakeStorage({ "dash.stayOnTopFullscreen": "0" });
    expect(legacyFromStorage(s.getItem)).toEqual({ stayOnTopFullscreen: false });
  });

  it("skips values 0.4.x could not have written", () => {
    const s = fakeStorage({
      "dash.hotkey": "  ",
      "dash.stayOnTopFullscreen": "yes",
      "dash.checkUpdates": "",
    });
    expect(legacyFromStorage(s.getItem)).toEqual({});
  });
});

describe("adoptLegacySettings", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the old values to Rust, then removes every old key", async () => {
    const s = fakeStorage({
      "dash.hotkey": "Alt+N",
      "dash.checkUpdates": "0",
      // Not a setting: stays where it is.
      "dash.lastUpdateCheck": "1800000000000",
    });
    vi.stubGlobal("localStorage", s);
    invoke.mockResolvedValue({});
    const { adoptLegacySettings } = await import("./settings");

    await adoptLegacySettings();
    expect(invoke).toHaveBeenCalledWith("adopt_settings", {
      legacy: { hotkey: "Alt+N", checkUpdates: false },
    });
    for (const k of Object.values(LEGACY_KEYS)) expect(s.map.has(k)).toBe(false);
    expect(s.map.get("dash.lastUpdateCheck")).toBe("1800000000000");

    // Once per window: a second call does not ask Rust again.
    await adoptLegacySettings();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the old keys when Rust could not save them", async () => {
    const s = fakeStorage({ "dash.stayOnTopFullscreen": "1" });
    vi.stubGlobal("localStorage", s);
    invoke.mockRejectedValue("disk full");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { adoptLegacySettings } = await import("./settings");

    await adoptLegacySettings();
    expect(s.map.get("dash.stayOnTopFullscreen")).toBe("1");
  });

  it("does nothing once the keys are gone", async () => {
    vi.stubGlobal("localStorage", fakeStorage({}));
    const { adoptLegacySettings } = await import("./settings");

    await adoptLegacySettings();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("drops an unreadable leftover without bothering Rust", async () => {
    const s = fakeStorage({ "dash.stayOnTopFullscreen": "garbage" });
    vi.stubGlobal("localStorage", s);
    const { adoptLegacySettings } = await import("./settings");

    await adoptLegacySettings();
    expect(invoke).not.toHaveBeenCalled();
    expect(s.map.size).toBe(0);
  });

  it("reads the settings only after the carry-over", async () => {
    const s = fakeStorage({ "dash.hotkey": "Alt+N" });
    vi.stubGlobal("localStorage", s);
    invoke.mockResolvedValue({ hotkey: "Alt+N" });
    const { getSettings } = await import("./settings");

    await getSettings();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["adopt_settings", "get_settings"]);
  });
});
