import { describe, expect, it } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { addUtcDays, timelineLayout } from "@/app/workspace/renderers/collectionTimelineDates";
describe("Collection Timeline range and date math", () => {
  it("calculates inclusive duration across leap day and year boundaries", () => {
    const d = createCollection(); const start = d.fields[2].id, end = d.fields[3].id;
    d.records = [{ id: "stable", values: { [start]: "2024-02-28", [end]: "2024-03-01" } }];
    const range = timelineLayout(d.records, start, end);
    expect(range.entries[0]).toMatchObject({ startOffset: 0, length: 3 });
    expect(range.entries[0].record.id).toBe("stable");
    expect(addUtcDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("does not silently create invalid dates or negative bars", () => {
    const d = createCollection(); const start = d.fields[2].id, end = d.fields[3].id;
    d.records = [{ id: "bad", values: { [start]: "2026-10-14", [end]: "2026-10-10" } },
      { id: "invalid", values: { [start]: "2026-02-30" } }];
    const result = timelineLayout(d.records, start, end);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].length).toBe(1);
    expect(result.undated).toBe(1);
    expect(addUtcDays("2026-02-30", 1)).toBeNull();
  });
  it("caps exceptionally long ranges for safe rendering", () => {
    const d = createCollection(); const start = d.fields[2].id;
    d.records = [{ id: "a", values: { [start]: "2020-01-01" } },
      { id: "b", values: { [start]: "2026-10-13" } }];
    const result = timelineLayout(d.records, start, start);
    expect(result.days).toBe(180);
    expect(result.beyondWindow).toBe(1);
  });
});
