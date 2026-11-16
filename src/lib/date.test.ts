import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysFromTodayISO,
  endOfNextWeekISO,
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

describe("next week", () => {
  // 2026-11-16 is a Monday.
  const day = (d: number) => new Date(2026, 10, d, 15, 30);

  it("runs to the Sunday that ends next week", () => {
    expect(endOfNextWeekISO(day(16))).toBe("2026-11-29"); // Monday: 13 days
    expect(endOfNextWeekISO(day(19))).toBe("2026-11-29"); // Thursday
    expect(endOfNextWeekISO(day(21))).toBe("2026-11-29"); // Saturday
    expect(endOfNextWeekISO(day(22))).toBe("2026-11-29"); // Sunday: the coming week
    expect(endOfNextWeekISO(day(23))).toBe("2026-12-06"); // the Monday after
  });

  it("crosses a month and a year", () => {
    expect(endOfNextWeekISO(new Date(2026, 11, 30))).toBe("2027-01-10"); // Wednesday
  });
});

describe("the folder last open", () => {
  it("reads what settings.json keeps, and falls back to all", async () => {
    const { scopeFrom } = await import("./types");
    expect(scopeFrom("all")).toBe("all");
    expect(scopeFrom("unfiled")).toBe("unfiled");
    expect(scopeFrom("12")).toBe(12);
    expect(scopeFrom("")).toBe("all");
    expect(scopeFrom("-3")).toBe("all");
    expect(scopeFrom("1.5")).toBe("all");
    expect(scopeFrom("nonsense")).toBe("all");
  });
});
