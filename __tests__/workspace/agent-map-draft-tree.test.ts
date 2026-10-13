import { describe, expect, it } from "vitest";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { normalizeMapDrafts } from "@/app/api/workspaces/[id]/agent/mapDraftTree";

const board = () => ({ title: "t", blocks: {} as Record<string, Record<string, unknown>>, blockOrder: [] as string[], connectors: {} as Record<string, Record<string, unknown>> });
const parents = (state: ReturnType<typeof board>) =>
  Object.fromEntries(Object.values(state.blocks).map((b) => [String((b.data as { markdown: string }).markdown), b.parentId ? String((state.blocks[String(b.parentId)].data as { markdown: string }).markdown) : null]));

describe("create_map node normalisation", () => {
  it("turns a flat list into a root with children", () => {
    const state = board();
    applyAgentAction(state as never, { type: "create_map", layoutType: "mindmap", nodes: [{ topic: "ROOT" }, { topic: "K1" }, { topic: "K2" }] });
    expect(parents(state)).toEqual({ ROOT: null, K1: "ROOT", K2: "ROOT" });
    expect(Object.keys(state.connectors)).toHaveLength(2);
  });

  it("honours parent hints by text", () => {
    const state = board();
    applyAgentAction(state as never, { type: "create_map", nodes: [{ topic: "ROOT" }, { topic: "A", parent: "ROOT" }, { topic: "A1", parent: "A" }] });
    expect(parents(state)).toEqual({ ROOT: null, A: "ROOT", A1: "A" });
  });

  it("leaves an already nested tree alone", () => {
    const raw = { type: "create_map", nodes: [{ topic: "R", children: [{ topic: "K" }] }] };
    expect(normalizeMapDrafts(raw)).toBe(raw);
  });
});
