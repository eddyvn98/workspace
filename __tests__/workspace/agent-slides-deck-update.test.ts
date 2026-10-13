// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { normalizeSlideDeckData } from "@/app/workspace/utils/slideDeckOps";

function deckBoard() {
  const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
  const id = applyAgentAction(board, {
    type: "create_slide_deck",
    slides: [
      { layout: "title", title: "Intro", notes: "n1" },
      { layout: "title-bullets", title: "Body", bullets: ["a", "b"] },
      { layout: "title", title: "End" },
    ],
  }).ids[0];
  return { board, id };
}
const read = (board: AgentBoardState, id: string) => normalizeSlideDeckData(JSON.parse(JSON.stringify(board.blocks[id].data)));
const snapshot = (board: AgentBoardState, id: string) => JSON.stringify(board.blocks[id]);
const run = (board: AgentBoardState, id: string, action: Record<string, unknown>) => applyAgentAction(board, { type: "update_slides", blockId: id, ...action });

describe("update_slides", () => {
  it("edits many slides at once by id, 1-based index and unique name, with layouts and notes", () => {
    const { board, id } = deckBoard();
    const before = read(board, id);
    const result = run(board, id, {
      slides: [
        { slideId: before.slideOrder[0], layout: "title", title: "New intro", notes: "spoken" },
        { index: 2, layout: "stats", title: "Numbers", items: [{ value: "5", label: "a" }, { value: "6", label: "b" }] },
        { name: "End", layout: "closing", title: "Thanks", newName: "Closing" },
      ],
    });
    expect(result.reason).toBeUndefined();
    expect(result.ids).toEqual([id]);
    const data = read(board, id);
    expect(data.slides[before.slideOrder[0]].html).toBe("<h1>New intro</h1>");
    expect(data.slides[before.slideOrder[0]].presenterNotes).toBe("spoken");
    expect(data.slides[before.slideOrder[1]].html).toContain("<h1>5</h1>");
    expect(data.slides[before.slideOrder[2]].name).toBe("Closing");
    expect(data.slides[before.slideOrder[2]].html).toContain("Thanks");
    expect(data.slideOrder).toEqual(before.slideOrder);
  });

  it("is atomic: a failing item in the middle changes nothing", () => {
    const { board, id } = deckBoard();
    const before = snapshot(board, id);
    const slideIds = read(board, id).slideOrder;
    const result = run(board, id, {
      slides: [{ slideId: slideIds[0], html: "<p>changed</p>" }, { slideId: slideIds[1], backgroundColor: "nope" }],
      deleteSlideIds: [slideIds[2]],
      insert: [{ layout: "title", title: "extra" }],
    });
    expect(result.ids).toEqual([]);
    expect(result.reason).toContain("slides[1]");
    expect(snapshot(board, id)).toBe(before);
    for (const bad of [
      { slides: [{ index: 9, html: "<p>x</p>" }] },
      { slides: [{ slideId: slideIds[0] }] },
      { slides: [{ slideId: slideIds[0], layout: "title", title: "[TBD title]" }] },
      { deleteSlideIds: ["missing"] },
      { insert: [{ layout: "stats", title: "x" }] },
      { insert: [{ afterSlideId: "missing", layout: "title", title: "x" }] },
      { slideOrder: [slideIds[0]] },
      {},
    ]) {
      const failed = run(board, id, bad);
      expect(failed.ids).toEqual([]);
      expect(failed.reason).toBeTruthy();
      expect(snapshot(board, id)).toBe(before);
    }
  });

  it("deletes, reorders the remaining slides and inserts by afterSlideId and position", () => {
    const { board, id } = deckBoard();
    const [a, b, c] = read(board, id).slideOrder;
    const result = run(board, id, {
      deleteSlideIds: [a],
      slideOrder: [c, b],
      insert: [{ afterSlideId: c, layout: "agenda", title: "Agenda", bullets: ["one", "two"] }, { position: 1, layout: "quote", text: "Hello", author: "Me" }],
    });
    expect(result.reason).toBeUndefined();
    const data = read(board, id);
    expect(data.slideOrder).toHaveLength(4);
    expect(data.slideOrder.slice(-3).includes(a)).toBe(false);
    expect(data.slides[data.slideOrder[0]].html).toContain("<blockquote>");
    expect(data.slideOrder[1]).toBe(c);
    expect(data.slides[data.slideOrder[2]].html).toContain("<ol>");
    expect(data.slideOrder[3]).toBe(b);
    expect(data.activeSlideId).toBe(data.slideOrder[2]);
    expect(result.notes?.join(" ")).toContain("Inserted 2");
  });

  it("can replace every slide in one call but never leave the deck empty or over 60 slides", () => {
    const { board, id } = deckBoard();
    const ids = read(board, id).slideOrder;
    const empty = run(board, id, { deleteSlideIds: ids });
    expect(empty.reason).toContain("no slides left");
    expect(read(board, id).slideOrder).toEqual(ids);
    const replaced = run(board, id, { deleteSlideIds: ids, insert: [{ layout: "title", title: "Fresh" }] });
    expect(replaced.reason).toBeUndefined();
    expect(read(board, id).slideOrder).toHaveLength(1);
    const many = run(board, id, { insert: Array.from({ length: 60 }, (_, index) => ({ layout: "title", title: `S${index}` })) });
    expect(many.reason).toContain("at most 60");
    expect(read(board, id).slideOrder).toHaveLength(1);
  });

  it("targets the only deck without a blockId, but refuses non-deck blocks", () => {
    const { board, id } = deckBoard();
    const result = applyAgentAction(board, { type: "update_slides", slides: [{ index: 1, html: "<p>x</p>" }] });
    expect(result.ids).toEqual([id]);
    const text = applyAgentAction(board, { type: "create_block", blockType: "text", text: "hi" }).ids[0];
    expect(applyAgentAction(board, { type: "update_slides", blockId: text, slides: [{ index: 1, html: "x" }] }).reason).toContain("not a slideDeck");
  });

  it("can still edit and delete slides of a deck that is already over the creation cap", () => {
    const { board, id } = deckBoard();
    const slides: Record<string, unknown> = {};
    const order: string[] = [];
    for (let i = 0; i < 70; i++) { const sid = `s${i}`; order.push(sid); slides[sid] = { id: sid, name: `Slide ${i}`, html: `<p>${i}</p>` }; }
    (board.blocks[id] as { data: Record<string, unknown> }).data = { slides, slideOrder: order, activeSlideId: "s0" };
    expect(run(board, id, { slides: [{ slideId: "s5", name: "Renamed" }] }).ids).toHaveLength(1);
    expect(run(board, id, { deleteSlideIds: ["s6"] }).ids).toHaveLength(1);
    expect(read(board, id).slideOrder).toHaveLength(69);
  });
});
