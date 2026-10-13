// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { buildWorkspaceAgentMutationMetrics } from "@/lib/workspace-agent-metrics";
import { findUnconfirmedDuplicateTargetFanout } from "@/app/api/workspaces/[id]/agent/paritySelectionOperations";

function state(): AgentBoardState {
  return { blocks: {}, blockOrder: [], connectors: {}, title: "Parity test" };
}

describe("Workspace command parity operations", () => {
  it("blocks an unconfirmed fan-out across duplicate labels but permits explicit all-matches intent", () => {
    const board = state();
    board.blocks = {
      first: { id: "first", type: "text", data: { markdown: "Target" } },
      second: { id: "second", type: "text", data: { markdown: "target" } },
    };
    board.blockOrder = ["first", "second"];
    const actions = [
      { type: "update_style", target: "first", style: { textColor: "#ff0000" } },
      { type: "update_style", target: "second", style: { textColor: "#ff0000" } },
    ];

    expect(findUnconfirmedDuplicateTargetFanout(actions, board)).toEqual({ label: "Target", ids: ["first", "second"] });
    expect(findUnconfirmedDuplicateTargetFanout(actions.map((action) => ({ ...action, applyToAllMatches: true })), board)).toBeNull();
  });

  it("creates standalone content blocks through the agent executor", () => {
    const board = state();
    const text = applyAgentAction(board, { type: "create_block", blockType: "text", text: "AI note" });
    const image = applyAgentAction(board, { type: "create_block", blockType: "image", data: { url: "https://example.com/a.png" } });

    expect(board.blocks[text.ids[0]]).toMatchObject({ type: "text", data: { markdown: "AI note" } });
    expect(board.blocks[image.ids[0]]).toMatchObject({ type: "image", data: { url: "https://example.com/a.png" } });
    expect(board.blockOrder).toEqual([text.ids[0], image.ids[0]]);
  });

  it("places a new block clear of existing blocks instead of overlapping them", () => {
    const board = state();
    board.blocks.a = { id: "a", type: "text", transform: { computed: { x: 80, y: 80, w: 220, h: 100 }, override: null } };
    board.blockOrder.push("a");
    const created = applyAgentAction(board, { type: "create_block", blockType: "text", text: "New" });
    const { x, y, w, h } = board.blocks[created.ids[0]].transform.override;

    expect(x < 80 + 220 + 24 && x + w + 24 > 80 && y < 80 + 100 + 24 && y + h + 24 > 80).toBe(false);
  });

  it("patches free transform fields without replacing the other transform values", () => {
    const board = state();
    const created = applyAgentAction(board, { type: "create_block", blockType: "text", text: "Move me", x: 20, y: 30 });
    const id = created.ids[0];

    expect(applyAgentAction(board, { type: "update_transform", blockId: id, transform: { x: 400, rotation: 15 } }).ids).toEqual([id]);
    expect(board.blocks[id].transform.override).toMatchObject({ x: 400, y: 30, rotation: 15, w: 180, h: 90 });
  });

  it("uses the same front/back semantics as the canvas block order menu", () => {
    const board = state();
    board.blocks = {
      a: { id: "a" },
      b: { id: "b" },
      c: { id: "c" },
    };
    board.blockOrder = ["a", "b", "c"];

    applyAgentAction(board, { type: "update_z_order", blockId: "a", zOrder: "front" });
    expect(board.blockOrder).toEqual(["b", "c", "a"]);
    applyAgentAction(board, { type: "update_z_order", blockId: "a", zOrder: "back" });
    expect(board.blockOrder).toEqual(["a", "b", "c"]);
  });

  it("resolves target IDs in the payload shape emitted by Dify", () => {
    const board = state();
    board.blocks = { a: { id: "a" }, b: { id: "b" }, c: { id: "c" } };
    board.blockOrder = ["a", "b", "c"];

    expect(applyAgentAction(board, { type: "update_z_order", target: "a", zOrder: "front" }).ids).toEqual(["a"]);
    expect(board.blockOrder).toEqual(["b", "c", "a"]);
  });

  it("disconnects by connector id or by exact endpoints", () => {
    const board = state();
    board.blocks = { a: { id: "a", data: { markdown: "A" } }, b: { id: "b", data: { markdown: "B" } } };
    board.blockOrder = ["a", "b"];
    board.connectors = { link: { id: "link", fromBlockId: "a", toBlockId: "b" } };

    expect(applyAgentAction(board, { type: "disconnect_nodes", fromBlockId: "a", toBlockId: "b" }).ids).toEqual(["link"]);
    expect(board.connectors).toEqual({});
  });

  it("applies rich text data fields and complete connector presentation patches", () => {
    const board = state();
    const text = applyAgentAction(board, { type: "create_block", blockType: "text", text: "Styled" }).ids[0];
    applyAgentAction(board, {
      type: "update_style",
      blockId: text,
      style: { fontSize: 24, bold: true, italic: true, underline: true, align: "center", padding: 12, backgroundColor: "#fff" },
    });
    expect(board.blocks[text].data).toMatchObject({ fontSize: 24, fontWeight: "bold", fontStyle: "italic", fontUnderline: true, align: "center", padding: 12 });
    expect(board.blocks[text].style).toMatchObject({ backgroundColor: "#fff" });
    expect(board.blocks[text].style).not.toHaveProperty("bold");
    expect(board.blocks[text].style).not.toHaveProperty("italic");
    expect(board.blocks[text].style).not.toHaveProperty("underline");

    board.blocks.a = { id: "a", data: { markdown: "A" } };
    board.blocks.b = { id: "b", data: { markdown: "B" } };
    board.blockOrder.push("a", "b");
    board.connectors.link = { id: "link", fromBlockId: "a", toBlockId: "b" };
    applyAgentAction(board, {
      type: "update_relationship",
      from: "a",
      to: "b",
      relationshipPatch: { lineColor: "#ef4444", labelColor: "#111827", labelFontSize: 18, labelBold: true, waypoints: [{ x: 10, y: 20 }] },
    });
    expect(board.connectors.link).toMatchObject({ strokeColor: "#ef4444", labelColor: "#111827", labelFontSize: 18, labelBold: true, waypoints: [{ x: 10, y: 20 }] });
  });

  it("keeps a shape kind in the canonical data field when updating style", () => {
    const board = state();
    const shape = applyAgentAction(board, { type: "create_shape", shape: { shapeType: "rectangle", text: "Shape" } }).ids[0];

    applyAgentAction(board, { type: "update_style", blockId: shape, style: { shapeKind: "ellipse" } });

    expect(board.blocks[shape].data).toMatchObject({ shapeKind: "ellipse" });
    expect(board.blocks[shape].style).toMatchObject({ shapeKind: "ellipse" });
  });

  it("renames the board through the shared command executor", () => {
    const board = state();

    expect(applyAgentAction(board, { type: "rename_board", title: "AI Canvas" }).ids).toEqual(["board"]);
    expect(board.title).toBe("AI Canvas");
  });

  it("replaces text within a scoped selection without touching other blocks", () => {
    const board = state();
    const first = applyAgentAction(board, { type: "create_block", blockType: "text", text: "Draft draft" }).ids[0];
    const second = applyAgentAction(board, { type: "create_block", blockType: "text", text: "Draft elsewhere" }).ids[0];

    expect(applyAgentAction(board, { type: "search_replace", blockIds: [first], query: "draft", replacement: "Final" }).ids).toEqual([first]);
    expect(board.blocks[first].data.markdown).toBe("Final Final");
    expect(board.blocks[second].data.markdown).toBe("Draft elsewhere");
  });

  it("replaces and clears attached images, including an empty replacement list", () => {
    const board = state();
    board.blocks.text = { id: "text", type: "text", attachedImages: [{ url: "https://example.com/old.png" }] };

    applyAgentAction(board, { type: "update_image", blockId: "text", images: [{ url: "https://example.com/new.png", alt: "New image" }] });
    expect(board.blocks.text.attachedImages).toEqual([{ url: "https://example.com/new.png", alt: "New image" }]);

    applyAgentAction(board, { type: "update_image", blockId: "text", images: [] });
    expect(board.blocks.text.attachedImages).toBeUndefined();

    board.blocks.text.attachedImages = [{ url: "https://example.com/one.png" }];
    applyAgentAction(board, { type: "update_image", blockId: "text", removeImageIndex: 0 });
    expect(board.blocks.text.attachedImages).toBeUndefined();
  });

  it("arranges an ordered selection and creates graph connectors for flowchart mode", () => {
    const board = state();
    const ids = ["a", "b", "c"];
    ids.forEach((id, index) => {
      board.blocks[id] = { id, data: { markdown: id }, transform: { override: { x: index * 20, y: 10, w: 100, h: 40 } } };
    });
    board.blockOrder = ids;

    const result = applyAgentAction(board, { type: "arrange_selection", blockIds: ids, mode: "flowchart", gap: 30 });

    expect(result.ids).toHaveLength(5);
    expect(board.blocks.b.transform.override).toMatchObject({ x: 0, y: 80 });
    expect(Object.values(board.connectors)).toHaveLength(2);
  });

  it("reports persisted action counts for runtime replay evidence", () => {
    expect(buildWorkspaceAgentMutationMetrics([
      { type: "update_style", ids: ["shape"], changed: true },
      { type: "update_transform", ids: [], changed: false },
    ], true, 24)).toEqual({
      actionCount: 2,
      changedActionCount: 1,
      persisted: true,
      revision: 24,
    });
  });


  it("updates multiple table cells atomically and rejects an invalid batch without partial writes", () => {
    const board = state();
    const table = applyAgentAction(board, {
      type: "create_block",
      blockType: "table",
      data: { rows: 2, cols: 3, cells: [["", "", ""], ["", "", ""]] },
    }).ids[0];
    const cells = [
      { row: 0, column: 0, value: "Task" },
      { row: 0, column: 1, value: "Owner" },
      { row: 0, column: 2, value: "Status" },
      { row: 1, column: 0, value: "Test service" },
      { row: 1, column: 1, value: "Team" },
      { row: 1, column: 2, value: "In progress" },
    ];

    expect(applyAgentAction(board, { type: "update_table_cells", blockId: table, cells }).ids).toEqual([table]);
    expect(board.blocks[table].data.cells).toEqual([
      ["Task", "Owner", "Status"],
      ["Test service", "Team", "In progress"],
    ]);

    expect(applyAgentAction(board, {
      type: "update_table_cells",
      blockId: table,
      cells: [{ row: 0, column: 0, value: "Must not partially save" }, { row: 8, column: 0, value: "Out of range" }],
    }).ids).toEqual([]);
    expect(board.blocks[table].data.cells[0][0]).toBe("Task");
  });

  it("creates and edits freehand paths with separate bounds and stroke width", () => {
    const board = state();
    const created = applyAgentAction(board, {
      type: "create_freehand",
      points: [{ x: 8, y: 8 }, { x: 100, y: 60 }],
      x: 240,
      y: 120,
      width: 120,
      height: 80,
      strokeWidth: 6,
      color: "#2563eb",
      opacity: 50,
    });
    const pathId = created.ids[0];

    expect(board.blocks[pathId]).toMatchObject({
      type: "path",
      transform: { override: { w: 120, h: 80 } },
      data: { strokeWidth: 6, strokeColor: "#2563eb", opacity: 0.5 },
    });
    expect(applyAgentAction(board, { type: "update_freehand", blockId: pathId, strokeWidth: 3, points: [{ x: 8, y: 8 }, { x: 70, y: 90 }] }).ids).toEqual([pathId]);
    expect(board.blocks[pathId].data).toMatchObject({ strokeWidth: 3, points: [{ x: 8, y: 8 }, { x: 70, y: 90 }] });
    expect(JSON.parse(JSON.stringify(board.blocks[pathId]))).toEqual(board.blocks[pathId]);
  });

  it("rejects shape deletion for a path and deletes it only through the freehand command", () => {
    const board = state();
    const pathId = applyAgentAction(board, {
      type: "create_freehand",
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
    }).ids[0];

    expect(applyAgentAction(board, { type: "delete_shape", target: pathId }).ids).toEqual([]);
    expect(board.blocks[pathId]).toBeDefined();
    expect(applyAgentAction(board, { type: "delete_freehand", target: pathId }).ids).toEqual([pathId]);
    expect(board.blocks[pathId]).toBeUndefined();
  });

  it("replays slide deck lifecycle and preserves slide ids", () => {
    const board = state();
    const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
    const first = board.blocks[deck].data.slideOrder[0];
    expect(applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, name: "Opening", html: "<h1>Welcome</h1>", presenterNotes: "Say hello", status: "done", backgroundColor: "#f8fafc" }).ids).toEqual([deck]);
    expect(applyAgentAction(board, { type: "add_slide", blockId: deck, afterSlideId: first, name: "Next" }).ids).toEqual([deck]);
    const second = board.blocks[deck].data.activeSlideId;
    expect(second).not.toBe(first);
    expect(applyAgentAction(board, { type: "reorder_slides", blockId: deck, slideOrder: [second, first] }).ids).toEqual([deck]);
    expect(applyAgentAction(board, { type: "delete_slide", blockId: deck, slideId: first }).ids).toEqual([deck]);
    expect(board.blocks[deck].data.slideOrder).toEqual([second]);
    expect(board.blocks[deck].data.slides[second].name).toBe("Next");
  });

  it("applies structured rich-text marks to document and shape content", () => {
    const board = state();
    const doc = applyAgentAction(board, { type: "create_block", blockType: "doc", data: { html: "<p>Draft text</p>" } }).ids[0];
    const shape = applyAgentAction(board, { type: "create_shape", shape: { shapeType: "rectangle", text: "Shape" } }).ids[0];
    board.blocks[shape].data.label = "Shape label";
    expect(applyAgentAction(board, { type: "update_rich_text", blockId: doc, query: "Draft", marks: { bold: true, italic: true } }).ids).toEqual([doc]);
    expect(applyAgentAction(board, { type: "update_rich_text", blockId: shape, query: "Shape", marks: { underline: true } }).ids).toEqual([shape]);
    expect(board.blocks[doc].data.html).toContain("<strong><em>Draft</em></strong>");
    expect(board.blocks[shape].data.label).toContain("<u>Shape</u>");
  });

  it("replays persistent presentation frame lifecycle", () => {
    const board = state();
    const createdOverview = applyAgentAction(board, { type: "create_frame", name: "Overview", camera: { x: 10, y: 20, zoom: 1 } });
    expect(createdOverview).toMatchObject({ summary: 'created frame "Overview"' });
    expect(createdOverview.ids).toHaveLength(1);
    const createdDetail = applyAgentAction(board, { type: "create_frame", name: "Detail", camera: { x: 50, y: 60, zoom: 2 } });
    expect(createdDetail).toMatchObject({ summary: 'created frame "Detail"' });
    expect(createdDetail.ids).toHaveLength(1);
    const ids = board.frames.map((frame: { id: string }) => frame.id);
    expect(applyAgentAction(board, { type: "reorder_frames", frameIds: [ids[1], ids[0]] })).toMatchObject({ ids: [ids[1], ids[0]], summary: 'reordered frames: "Detail", "Overview"' });
    expect(applyAgentAction(board, { type: "update_frame", frameId: ids[1], name: "Updated" })).toMatchObject({ ids: [ids[1]], summary: 'updated frame "Updated"' });
    expect(applyAgentAction(board, { type: "delete_frame", frameId: ids[0] })).toMatchObject({ ids: [ids[0]], summary: 'deleted frame "Overview"' });
    expect(board.frames).toHaveLength(1);
    expect(board.frames[0].name).toBe("Updated");
  });
});
