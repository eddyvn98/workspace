// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { exportToMarkdown } from "@/app/workspace/utils/markdownExport";
import { importFromMarkdown } from "@/app/workspace/utils/markdownImport";
import { receiptNotes } from "@/app/api/workspaces/[id]/agent/receiptNotes";
import type { CanvasBlock } from "@/app/workspace/types/block";

const deckBlock = {
  id: "deck1",
  type: "slideDeck",
  data: {
    title: "Roadmap",
    slideOrder: ["a", "b"],
    slides: {
      a: { id: "a", name: "Intro", html: "<h1>Welcome</h1><ul><li><p>One</p></li></ul>", presenterNotes: "Say hi\nSlowly" },
      b: { id: "b", name: "Secret", html: "<p>Later</p>", hidden: true, status: "in_progress" },
    },
  },
} as unknown as CanvasBlock;

describe("export_board markdown for slide decks", () => {
  const md = exportToMarkdown({ deck1: deckBlock }, ["deck1"], "Board");

  it("renders one section per slide with text and notes as a blockquote", () => {
    expect(md).toContain("- Slide deck: Roadmap (2 slides, 16:9)");
    expect(md).toContain("## 1. Intro");
    expect(md).toContain("**Welcome**\n- One");
    expect(md).toContain("> Presenter notes:\n> Say hi\n> Slowly");
    expect(md).toContain("## 2. Secret (hidden, in progress)");
    expect(md).not.toContain("(empty)");
  });

  it("imports back without choking (full data block restores the deck)", () => {
    const result = importFromMarkdown(md);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe("slideDeck");
  });

  it("imports the readable part alone when the data block is missing", () => {
    const readable = md.slice(0, md.indexOf("<!--WORKSPACE_DATA"));
    const result = importFromMarkdown(readable);
    expect(result.blocks.length).toBeGreaterThan(0);
  });
});

function boardWithFrames() {
  const board: AgentBoardState = {
    blocks: { n1: { id: "n1", type: "text", data: { markdown: "N1" }, transform: { override: { x: 100, y: 100, w: 200, h: 100 } } } },
    blockOrder: ["n1"], connectors: {}, title: "t",
    camera: { x: 5, y: 6, zoom: 1, activeFrameId: null },
    frames: [
      { id: "f1", name: "Intro", order: 0, camera: { x: -400, y: -250, zoom: 2 } },
      { id: "f2", name: "Roadmap", order: 1, camera: { x: 10, y: 20, zoom: 0.5 } },
    ],
  } as unknown as AgentBoardState;
  return board;
}

describe("focus_view with saved frames", () => {
  it("jumps to a frame by id and records activeFrameId", () => {
    const board = boardWithFrames();
    const result = applyAgentAction(board, { type: "focus_view", frameId: "f1" });
    expect(result.ids).toEqual(["f1"]);
    expect(board.camera).toMatchObject({ x: -400, y: -250, zoom: 2, activeFrameId: "f1", focus: { seq: 1, mode: "frame", blockIds: [] } });
  });

  it("jumps by frame name (case-insensitive) and survives a JSON round trip", () => {
    const board = boardWithFrames();
    expect(applyAgentAction(board, { type: "focus_view", frameName: "roadmap" }).ids).toEqual(["f2"]);
    const persisted = JSON.parse(JSON.stringify(board.camera));
    expect(persisted).toMatchObject({ x: 10, y: 20, zoom: 0.5, activeFrameId: "f2" });
  });

  it("accepts a frame name in frameId and explains an unknown frame", () => {
    const board = boardWithFrames();
    expect(applyAgentAction(board, { type: "focus_view", frameId: "Intro" }).ids).toEqual(["f1"]);
    const missing = applyAgentAction(board, { type: "focus_view", frameName: "Nope" });
    expect(missing.ids).toEqual([]);
    expect(missing.reason).toContain("f1");
  });
});

describe("frame actions address frames by name and explain failures", () => {
  it("update_frame and delete_frame resolve frameName", () => {
    const board = boardWithFrames();
    expect(applyAgentAction(board, { type: "update_frame", frameName: "Intro", name: "Opening" })).toMatchObject({ ids: ["f1"], summary: 'updated frame "Opening"' });
    expect((board.frames as Array<{ name: string }>)[0].name).toBe("Opening");
    expect(applyAgentAction(board, { type: "delete_frame", frameName: "Roadmap" })).toMatchObject({ ids: ["f2"], summary: 'deleted frame "Roadmap"' });
    expect(board.frames).toHaveLength(1);
  });

  it("returns reasons for failed frame actions", () => {
    const board = boardWithFrames();
    expect(applyAgentAction(board, { type: "delete_frame", frameId: "zzz" }).reason).toContain("Saved frames");
    expect(applyAgentAction(board, { type: "create_frame", name: "x", blockIds: ["nope"] }).reason).toContain("camera");
    expect(applyAgentAction(board, { type: "reorder_frames", frameIds: ["f1"] }).reason).toContain("exactly once");
  });
});

describe("receipt notes", () => {
  it("surfaces action notes", () => {
    expect(receiptNotes([{ type: "add_slide", ids: ["d"], notes: ["add_slide ignored slideId"] }])).toEqual(["add_slide ignored slideId"]);
  });
});
