// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { normalizeSlideDeckData, presentableSlideOrder } from "@/app/workspace/utils/slideDeckOps";
import type { SlideDeckPayload } from "@/app/workspace/types/slide";

function setup() {
  const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Slides" };
  const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
  const first = (board.blocks[deck].data as { slideOrder: string[] }).slideOrder[0];
  const data = () => board.blocks[deck].data as unknown as SlideDeckPayload & Record<string, unknown>;
  /** Simulates the persisted board: JSON round trip, then the renderer's own normalisation. */
  const reloaded = () => normalizeSlideDeckData(JSON.parse(JSON.stringify(board.blocks[deck].data)));
  return { board, deck, first, data, reloaded };
}

describe("slide validation and receipts", () => {
  it("rejects an invalid status with a reason that lists the valid values", () => {
    const { board, deck, first, data } = setup();
    const result = applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, status: "finished" });
    expect(result.ids).toEqual([]);
    expect(result.reason).toContain("not_started, in_progress, done");
    expect(data().slides[first].status).toBeUndefined();
  });

  it("accepts hyphenated status and clears it with none", () => {
    const { board, deck, first, reloaded } = setup();
    expect(applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, status: "in-progress" }).ids).toEqual([deck]);
    expect(reloaded().slides[first].status).toBe("in_progress");
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, status: "none" });
    expect(reloaded().slides[first].status).toBeUndefined();
  });

  it("rejects a non-CSS backgroundColor and keeps the rest of the slide untouched", () => {
    const { board, deck, first, data } = setup();
    const result = applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, name: "Renamed", backgroundColor: "url(javascript:x)" });
    expect(result.ids).toEqual([]);
    expect(result.reason).toContain("backgroundColor");
    expect(data().slides[first].name).toBe("Slide 1");
    expect(applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, backgroundColor: "#0f172a" }).ids).toEqual([deck]);
  });

  it("returns a clear reason when the last slide cannot be deleted", () => {
    const { board, deck, first } = setup();
    const result = applyAgentAction(board, { type: "delete_slide", blockId: deck, slideId: first });
    expect(result.ids).toEqual([]);
    expect(result.reason).toMatch(/only slide/);
  });

  it("explains an unknown slide id and lists the real ones", () => {
    const { board, deck, first } = setup();
    const result = applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: "nope", name: "x" });
    expect(result.reason).toContain(first);
  });

  it("resolves a slide by unique name", () => {
    const { board, deck, first, reloaded } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, name: "Intro" });
    expect(applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: "intro", presenterNotes: "Hi" }).ids).toEqual([deck]);
    expect(reloaded().slides[first].presenterNotes).toBe("Hi");
  });
});

describe("add_slide and duplicate_slide", () => {
  it("ignores slideId on add_slide (blank slide) and says so in the notes", () => {
    const { board, deck, first, data } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, html: "<h1>Source</h1>" });
    const result = applyAgentAction(board, { type: "add_slide", blockId: deck, slideId: first, name: "Blank" });
    expect(result.ids).toEqual([deck]);
    expect(result.notes?.join(" ")).toContain("ignored slideId");
    const created = data().slides[data().activeSlideId as string];
    expect(created.html).toBe("");
    expect(created.name).toBe("Blank");
  });

  it("clones with copy:true and with duplicate_slide", () => {
    const { board, deck, first, data } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, html: "<h1>Source</h1>", presenterNotes: "n" });
    applyAgentAction(board, { type: "add_slide", blockId: deck, slideId: first, copy: true });
    expect(data().slides[data().activeSlideId as string].html).toBe("<h1>Source</h1>");
    applyAgentAction(board, { type: "duplicate_slide", blockId: deck, slideId: first, name: "Second copy" });
    expect(data().slides[data().activeSlideId as string].name).toBe("Second copy");
    expect(data().slideOrder).toHaveLength(3);
    expect(applyAgentAction(board, { type: "duplicate_slide", blockId: deck, slideId: "missing" }).reason).toContain("No slide matches");
  });

  it("creates a complete slide in one call (layout, notes, status, hidden)", () => {
    const { board, deck, reloaded } = setup();
    applyAgentAction(board, { type: "add_slide", blockId: deck, layout: "title-bullets", title: "Plan", bullets: ["A", "B"], presenterNotes: "Say it", status: "done", hidden: true, backgroundColor: "#fef3c7" });
    const deckData = reloaded();
    const slide = deckData.slides[deckData.activeSlideId!];
    expect(slide).toMatchObject({ name: "Plan", presenterNotes: "Say it", status: "done", hidden: true, backgroundColor: "#fef3c7" });
    expect(slide.html).toContain("<li><p>B</p></li>");
  });
});

describe("deck theme, numbers and hidden slides", () => {
  it("persists theme, showSlideNumbers and title through a JSON round trip", () => {
    const { board, deck, reloaded } = setup();
    const result = applyAgentAction(board, { type: "update_slide_deck", blockId: deck, title: "Q3 review", showSlideNumbers: true, theme: { backgroundColor: "#0f172a", textColor: "#ffffff", fontFamily: "Georgia, serif" }, aspectRatio: "4:3" });
    expect(result.ids).toEqual([deck]);
    expect(reloaded()).toMatchObject({ aspectRatio: "4:3", title: "Q3 review", showSlideNumbers: true, theme: { backgroundColor: "#0f172a", textColor: "#ffffff", fontFamily: "Georgia, serif" } });
  });

  it("merges theme patches and clears a field with none", () => {
    const { board, deck, reloaded } = setup();
    applyAgentAction(board, { type: "update_slide_deck", blockId: deck, theme: { backgroundColor: "#ffffff", textColor: "#111111" } });
    applyAgentAction(board, { type: "update_slide_deck", blockId: deck, theme: { textColor: "none" } });
    expect(reloaded().theme).toEqual({ backgroundColor: "#ffffff" });
    applyAgentAction(board, { type: "update_slide_deck", blockId: deck, showSlideNumbers: false });
    expect(reloaded().showSlideNumbers).toBeUndefined();
  });

  it("rejects a bad theme colour and font with a reason", () => {
    const { board, deck } = setup();
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: deck, theme: { backgroundColor: "not-a-colour" } }).reason).toContain("theme.backgroundColor");
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: deck, theme: { fontFamily: "a;b{}" } }).reason).toContain("fontFamily");
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: deck, aspectRatio: "21:9" }).reason).toContain("aspectRatio");
  });

  it("applyToAll writes the background onto every slide", () => {
    const { board, deck, reloaded } = setup();
    applyAgentAction(board, { type: "add_slide", blockId: deck });
    const result = applyAgentAction(board, { type: "update_slide_deck", blockId: deck, theme: { backgroundColor: "#dbeafe" }, applyToAll: true });
    expect(result.notes?.[0]).toContain("all 2 slides");
    expect(Object.values(reloaded().slides).map((slide) => slide.backgroundColor)).toEqual(["#dbeafe", "#dbeafe"]);
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: deck, applyToAll: true, backgroundColor: "#fff" }).ids).toEqual([deck]);
  });

  it("hidden slides persist and are skipped by Present mode", () => {
    const { board, deck, first, reloaded } = setup();
    applyAgentAction(board, { type: "add_slide", blockId: deck });
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, hidden: true });
    const data = reloaded();
    expect(data.slides[first].hidden).toBe(true);
    expect(presentableSlideOrder(data)).toEqual(data.slideOrder.filter((id) => id !== first));
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, hidden: false });
    expect(reloaded().slides[first].hidden).toBeUndefined();
  });

  it("Present mode falls back to all slides when every slide is hidden", () => {
    const { board, deck, first, reloaded } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, hidden: true });
    expect(presentableSlideOrder(reloaded())).toEqual([first]);
  });
});
