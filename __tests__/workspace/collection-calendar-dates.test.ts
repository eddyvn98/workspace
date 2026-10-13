import { describe, expect, it } from "vitest";
import { calendarDays, parseCalendarDay, shiftCalendarDay } from "@/app/workspace/renderers/collectionCalendarDates";

describe("Collection calendar date boundaries", () => {
  it("rejects invalid dates rather than shifting them silently", () => {
    expect(parseCalendarDay("2026-02-30")).toBeNull();
    expect(parseCalendarDay("2024-02-29")).not.toBeNull();
  });
  it("fills a Monday-first month grid with valid preceding and trailing dates", () => {
    const dates = calendarDays("2026-10-13", "month");
    expect(dates[0]).toBe("2026-09-28");
    expect(dates).toContain("2026-10-31");
    expect(dates.length % 7).toBe(0);
  });
  it("moves week and day over year boundaries without local timezone effects", () => {
    expect(calendarDays("2027-01-01", "week")).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
      "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(shiftCalendarDay("2026-12-31", "day", 1)).toBe("2027-01-01");
    expect(shiftCalendarDay("2026-12-31", "week", 1)).toBe("2027-01-07");
  });
  it("clamps month navigation at February 29 and handles leap years", () => {
    expect(shiftCalendarDay("2024-01-31", "month", 1)).toBe("2024-02-29");
    expect(shiftCalendarDay("2026-01-31", "month", 1)).toBe("2026-02-28");
  });
});
