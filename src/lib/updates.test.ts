import { describe, expect, it } from "vitest";
import { AUTO_CHECK_INTERVAL_MS, autoCheckDue } from "./updates";

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
