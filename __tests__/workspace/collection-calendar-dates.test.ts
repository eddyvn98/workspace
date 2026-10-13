import { describe, expect, it } from "vitest";
import { addView, createCollection, normalizeCollection } from "@/app/workspace/collections/model";
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

describe("Collection date view mapping migration", () => {
  it("defaults new Calendar/Timeline to first Start and second Due date fields", () => {
    const data = createCollection();
    const [start, due] = data.fields.filter(field => field.type === "date");
    for (const view of data.views.filter(view => view.kind === "calendar" || view.kind === "timeline")) {
      expect(view.dateFieldId).toBe(start.id);
      expect(view.endDateFieldId).toBe(due.id);
    }
    const added = addView(data, "timeline").views.at(-1)!;
    expect(added.dateFieldId).toBe(start.id);
    expect(added.endDateFieldId).toBe(due.id);
  });
  it("migrates legacy equal date IDs without changing stable IDs or records", () => {
    const data = createCollection();
    const [start, due] = data.fields.filter(field => field.type === "date");
    data.records = [{ id: "stable-task", values: { [start.id]: "2026-10-14", [due.id]: "2026-10-16" } }];
    const old = data.views.map(view => view.kind === "timeline" || view.kind === "calendar"
      ? { ...view, dateFieldId: due.id, endDateFieldId: due.id } : view);
    const previous = { ...data, views: old };
    const migrated = normalizeCollection(previous);
    for (const view of migrated.views.filter(view => view.kind === "calendar" || view.kind === "timeline")) {
      expect(view.dateFieldId).toBe(start.id);
      expect(view.endDateFieldId).toBe(due.id);
    }
    expect(migrated.views.map(view => view.id)).toEqual(old.map(view => view.id));
    expect(migrated.records).toBe(previous.records);
    expect(old.find(view => view.kind === "timeline")?.dateFieldId).toBe(due.id);
    expect(normalizeCollection(migrated).views).toEqual(migrated.views);
  });
  it("does not override explicitly different mappings or single-date collections", () => {
    const data = createCollection();
    const dates = data.fields.filter(field => field.type === "date");
    const index = data.views.findIndex(view => view.kind === "timeline");
    data.views[index] = { ...data.views[index], dateFieldId: dates[1].id, endDateFieldId: dates[0].id };
    expect(normalizeCollection(data).views[index]).toEqual(data.views[index]);
    data.fields = data.fields.filter(field => field.id !== dates[1].id);
    expect(normalizeCollection(data).views[index]).toEqual(data.views[index]);
  });
});
