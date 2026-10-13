import { describe, expect, it } from "vitest";
import { mergeBoardContent } from "@/app/workspace/utils/mergeBoardConflict";

const b = (id: string, t: string) => ({ id, data: { markdown: t } });
const c = (blocks: Record<string, unknown>, order: string[]) => ({ blocks, blockOrder: order, connectors: {} });

describe("mergeBoardContent", () => {
  const base = c({ a: b("a", "A"), b: b("b", "B") }, ["a", "b"]);

  it("keeps a local edit when the server changed a different block", () => {
    const mine = c({ a: b("a", "A_ME"), b: b("b", "B") }, ["a", "b"]);
    const theirs = c({ a: b("a", "A"), b: b("b", "B_AI"), n: b("n", "NEW") }, ["a", "b", "n"]);
    const m = mergeBoardContent(base, mine, theirs);
    expect(m.blocks).toMatchObject({ a: { data: { markdown: "A_ME" } }, b: { data: { markdown: "B_AI" } }, n: {} });
    expect(m.blockOrder).toEqual(["a", "b", "n"]);
    expect(m.conflicts).toBe(0);
  });

  it("keeps a block created locally and one removed on the server", () => {
    const mine = c({ a: b("a", "A"), b: b("b", "B"), l: b("l", "LOCAL") }, ["a", "b", "l"]);
    const theirs = c({ a: b("a", "A") }, ["a"]);
    const m = mergeBoardContent(base, mine, theirs);
    expect(Object.keys(m.blocks).sort()).toEqual(["a", "l"]);
    expect(m.blockOrder).toEqual(["a", "l"]);
  });

  it("counts a conflict and keeps the server value when both sides edited one block", () => {
    const mine = c({ a: b("a", "A_ME"), b: b("b", "B") }, ["a", "b"]);
    const theirs = c({ a: b("a", "A_AI"), b: b("b", "B") }, ["a", "b"]);
    const m = mergeBoardContent(base, mine, theirs);
    expect(m.blocks.a).toMatchObject({ data: { markdown: "A_AI" } });
    expect(m.conflicts).toBe(1);
  });

  it("ignores JSON key order differences", () => {
    const mine = c({ a: { data: { markdown: "A" }, id: "a" }, b: b("b", "B") }, ["a", "b"]);
    const theirs = c({ a: b("a", "A_AI"), b: b("b", "B") }, ["a", "b"]);
    expect(mergeBoardContent(base, mine, theirs).blocks.a).toMatchObject({ data: { markdown: "A_AI" } });
  });
});
