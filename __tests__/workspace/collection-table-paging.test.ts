import { describe, expect, it } from "vitest";
import { collectionTablePage } from "@/app/workspace/renderers/collectionTablePaging";

describe("Collection bounded Table row rendering", () => {
  it("shows the full small collection with stable row identity", () => {
    const values = [{ id: "r1" }, { id: "r2" }];
    const page = collectionTablePage(values, 0, 50);
    expect(page.rows.map(row => row.id)).toEqual(["r1", "r2"]);
    expect(page.pageCount).toBe(1);
    expect(page.pageIndex).toBe(0);
    expect(page.start).toBe(0);
    expect(page.end).toBe(2);
  });
  it("limits DOM rows to the configured size across 5,000 matching records", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => ({ id: "record-" + i }));
    const last = collectionTablePage(ids, 1000, 250);
    expect(last.pageCount).toBe(20);
    expect(last.pageIndex).toBe(19);
    expect(last.rows).toHaveLength(250);
    expect(last.rows[0].id).toBe("record-4750");
    expect(last.rows[249].id).toBe("record-4999");
  });
  it("clamps pagination after filters reduce the result count", () => {
    const ids = Array.from({ length: 501 }, (_, i) => ({ id: "r" + i }));
    expect(collectionTablePage(ids, 10, 50).rows.map(row => row.id)).toEqual(["r500"]);
    const filtered = ids.slice(0, 7);
    const result = collectionTablePage(filtered, 10, 50);
    expect(result.pageIndex).toBe(0);
    expect(result.rows).toHaveLength(7);
    expect(result.total).toBe(7);
  });
  it("accepts only bounded page sizes and empty collections", () => {
    const page = collectionTablePage([], Number.POSITIVE_INFINITY, 100_000);
    expect(page).toMatchObject({ pageSize: 50, pageIndex: 0, pageCount: 1, total: 0, start: 0, end: 0 });
  });
});
