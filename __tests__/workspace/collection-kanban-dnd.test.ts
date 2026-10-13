import { describe, expect, it } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { dropCollectionCard } from "@/app/workspace/renderers/collectionKanbanDrop";

describe("dnd-kit Kanban state adapter", () => {
  const setup = () => {
    const data = createCollection();
    data.records.push({ id: "stable-r1", values: {
      [data.fields[0].id]: "Task", [data.fields[1].id]: "To do" } });
    return data;
  };
  it("moves one stable record to a valid status without mutating original data", () => {
    const data = setup(); const fieldId = data.fields[1].id;
    const moved = dropCollectionCard(data, "stable-r1", fieldId, "Done", false);
    expect(moved.records[0].id).toBe("stable-r1");
    expect(moved.records[0].values[fieldId]).toBe("Done");
    expect(data.records[0].values[fieldId]).toBe("To do");
  });
  it("does not change read-only, unknown records, invalid status, or no-op drops", () => {
    const data = setup(); const fieldId = data.fields[1].id;
    expect(dropCollectionCard(data, "stable-r1", fieldId, "Done", true)).toBe(data);
    expect(dropCollectionCard(data, "unknown", fieldId, "Done", false)).toBe(data);
    expect(dropCollectionCard(data, "stable-r1", fieldId, "unknown", false)).toBe(data);
    expect(dropCollectionCard(data, "stable-r1", fieldId, "To do", false)).toBe(data);
  });
});
