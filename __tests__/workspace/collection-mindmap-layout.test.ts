import { describe, expect, it } from "vitest";
import { createCollection, setParent } from "@/app/workspace/collections/model";
import { layoutMindMap } from "@/app/workspace/renderers/collectionMindMapLayout";
describe("Collection Mind Map graph projection", () => {
  it("keeps record IDs stable and emits exactly the persisted parent edges", () => {
    let data = createCollection();
    data.records = [{ id: "root", values: {} }, { id: "child", values: {} },
      { id: "sibling", values: {} }];
    data = setParent(data, "child", "root");
    const graph = layoutMindMap(data.records);
    expect(graph.nodes.map(node => node.id)).toEqual(["root", "child", "sibling"]);
    expect(graph.edges).toEqual([{ source: "root", target: "child" }]);
    expect(graph.nodes.find(node => node.id === "child")?.x).toBeGreaterThan(0);
  });
  it("shows orphan/cyclic imported rows once, without recursion", () => {
    const rows = [{ id: "a", values: {}, parentId: "b" },
      { id: "b", values: {}, parentId: "a" },
      { id: "orphan", values: {}, parentId: "missing" }];
    const graph = layoutMindMap(rows);
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(3);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(1);
  });
  it("bounds rendering for large collections without changing their records", () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: "r" + i, values: {} }));
    const graph = layoutMindMap(rows);
    expect(graph.nodes).toHaveLength(200);
    expect(graph.truncated).toBe(1);
    expect(rows).toHaveLength(201);
  });
  it("pages through all records without silently dropping persistent parent links", () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ id: "r" + i, values: {}, parentId: i ? "r" + (i - 1) : null }));
    const page1 = layoutMindMap(rows, 200, 0);
    const page3 = layoutMindMap(rows, 200, 400);
    expect(page1.nodes).toHaveLength(200);
    expect(page3.nodes.map(node => node.id)).toEqual(rows.slice(400).map(row => row.id));
    expect(page3.nodes[0].parentId).toBeNull(); // parent is on a previous page
    expect(rows[400].parentId).toBe("r399"); // model relation is unchanged
    expect(page3.total).toBe(450);
    expect(page3.offset).toBe(400);
    expect(page3.truncated).toBe(400);
  });
});
