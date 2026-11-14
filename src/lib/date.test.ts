import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysFromTodayISO,
  formatDue,
  isOverdue,
  parseISODate,
  sameDay,
  toISODate,
  todayISO,
} from "./date";

describe("ISO dates", () => {
  it("round-trips a local calendar date", () => {
    const d = new Date(2026, 0, 5);
    expect(toISODate(d)).toBe("2026-01-05");
    expect(sameDay(parseISODate("2026-01-05"), d)).toBe(true);
  });

  it("pads month and day", () => {
    expect(toISODate(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("compares days, not times", () => {
    expect(sameDay(new Date(2026, 1, 1, 0, 1), new Date(2026, 1, 1, 23, 59))).toBe(true);
    expect(sameDay(new Date(2026, 1, 1), new Date(2026, 1, 2))).toBe(false);
  });
});

describe("relative to today", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 15, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("knows today and crosses the year", () => {
    expect(todayISO()).toBe("2026-12-31");
    expect(daysFromTodayISO(1)).toBe("2027-01-01");
    expect(daysFromTodayISO(-31)).toBe("2026-11-30");
    expect(daysFromTodayISO(7)).toBe("2027-01-07");
  });

  it("labels near dates in words", () => {
    expect(formatDue("2026-12-31")).toBe("Today");
    expect(formatDue("2027-01-01")).toBe("Tomorrow");
    expect(formatDue("2026-12-30")).toBe("Yesterday");
    expect(formatDue(null)).toBe("");
  });

  it("is overdue only before today", () => {
    expect(isOverdue("2026-12-30")).toBe(true);
    expect(isOverdue("2026-12-31")).toBe(false);
    expect(isOverdue("2027-01-01")).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });
});
