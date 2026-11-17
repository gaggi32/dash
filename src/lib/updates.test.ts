import { describe, expect, it } from "vitest";
import { AUTO_CHECK_INTERVAL_MS, autoCheckDue, installLabel } from "./updates";

describe("autoCheckDue", () => {
  const now = 1_800_000_000_000;

  it("checks the first time", () => {
    expect(autoCheckDue(now, null)).toBe(true);
    expect(autoCheckDue(now, Number.NaN)).toBe(true);
  });

  it("checks at most once a day", () => {
    expect(autoCheckDue(now, now - 60_000)).toBe(false);
    expect(autoCheckDue(now, now - AUTO_CHECK_INTERVAL_MS + 1)).toBe(false);
    expect(autoCheckDue(now, now - AUTO_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("does not get stuck after the clock went backwards", () => {
    expect(autoCheckDue(now, now + 5 * AUTO_CHECK_INTERVAL_MS)).toBe(true);
  });
});

describe("installLabel", () => {
  it("offers the version until pressed", () => {
    expect(installLabel("0.5.0", null)).toBe("Install 0.5.0");
  });

  it("shows the download, then the install", () => {
    expect(installLabel("0.5.0", -1)).toBe("Downloading…");
    expect(installLabel("0.5.0", 0)).toBe("Downloading 0%");
    expect(installLabel("0.5.0", 42.4)).toBe("Downloading 42%");
    expect(installLabel("0.5.0", 100)).toBe("Installing…");
  });
});
