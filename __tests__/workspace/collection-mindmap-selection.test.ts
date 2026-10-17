import { describe, expect, it } from "vitest";
import { visibleMindMapSelection } from "@/app/workspace/renderers/collectionMindMapSelection";
describe("Mind Map paging and record editor focus", () => {
  const records = Array.from({ length: 450 }, (_, i) => ({
    id: "record-" + i, values: { title: "Name " + i },
  }));
  it("selects first item of a newly opened page instead of editing a hidden previous page", () => {
    expect(visibleMindMapSelection(records, "record-0", 1)?.id).toBe("record-200");
    expect(visibleMindMapSelection(records, "record-201", 1)?.id).toBe("record-201");
  });
  it("clamps selection to its current page after filtering and deletion", () => {
    expect(visibleMindMapSelection(records.slice(300), "record-201", 0)?.id).toBe("record-300");
    expect(visibleMindMapSelection([], "record-201", 0)).toBeUndefined();
  });
  it("never selects a record outside the final partial page", () => {
    expect(visibleMindMapSelection(records, "record-0", 2)?.id).toBe("record-400");
  });
});
