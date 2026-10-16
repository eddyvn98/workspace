import { describe, expect, it } from "vitest";
import { addField, addRecord, createCollection } from "../../app/workspace/collections/model";
import { applyDueCollectionSchedules, sanitizeCollectionSchedules } from "../../app/workspace/collections/collectionSchedules";

describe("Collection daily schedules", () => {
  it("waits until the configured local minute and runs at most once per local day", () => {
    let data = createCollection();
    data = addField(data, "Automation result", "text");
    const [name, status] = data.fields;
    const target = data.fields.at(-1)!;
    data = addRecord(data, { [name.id]: "Matched", [status.id]: "To do" });
    data = addRecord(data, { [name.id]: "Skipped", [status.id]: "Done" });
    data = { ...data, scheduledAutomations: [{
      id: "daily-update", name: "Mark matched records", enabled: true,
      hour: 19, minute: 30, timeZone: "Asia/Ho_Chi_Minh",
      matchFieldId: status.id, matchEquals: "To do",
      targetFieldId: target.id, targetValue: "Ready",
    }] };

    const early = applyDueCollectionSchedules(data, new Date("2026-10-15T12:29:00Z"));
    expect(early.rulesRun).toBe(0);
    expect(early.next).toBe(data);

    const due = applyDueCollectionSchedules(data, new Date("2026-10-15T12:30:00Z"));
    expect(due.rulesRun).toBe(1);
    expect(due.recordsChanged).toBe(1);
    expect(due.next.records[0].values[target.id]).toBe("Ready");
    expect(due.next.records[1].values[target.id]).toBeUndefined();
    expect(due.next.scheduledAutomations?.[0].lastRunDay).toBe("2026-10-15");
    expect(applyDueCollectionSchedules(due.next, new Date("2026-10-15T13:00:00Z")).rulesRun).toBe(0);
  });

  it("drops malformed and duplicate persisted rules without throwing", () => {
    const data = createCollection();
    const valid = {
      id: "valid", name: "Valid", enabled: false, hour: 12, minute: 0,
      timeZone: "UTC" as const, targetFieldId: data.fields[0].id, targetValue: "ok",
    };
    const persisted = { ...data, scheduledAutomations: [
      { id: "broken", name: null },
      { ...valid, id: "invalid-day", lastRunDay: "2026-99-99" },
      valid, valid,
    ] as never };
    expect(sanitizeCollectionSchedules(persisted)).toEqual([valid]);
  });
});
