import { describe, expect, it } from "vitest";
import { buildModelStepQuery, WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS } from "@/lib/workspace-agent/modelStepContext";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { WORKSPACE_RUNTIME_ACTION_SCHEMAS } from "@/lib/workspace-agent/actionSchema";
import { selectWorkspaceCapabilities } from "@/lib/workspace-agent/capabilitySelection";
import { describeWorkspaceCapabilities } from "@/lib/workspace-command-capabilities";
import { applySlideAction } from "@/app/api/workspaces/[id]/agent/slideOperations";

const query = "Trong deck Acceptance slides, ở slide Verification, thêm đúng một bullet có nội dung Postdeploy slide check. Giữ nguyên nội dung cũ và không tạo slide mới.";
const oldHtml = "<h1>Verification</h1><ul><li>Existing bullet</li></ul>";
const makeDeck = (html = oldHtml) => ({
  type: "slideDeck", data: {
    title: "Acceptance slides", slideOrder: ["overview", "verification"],
    slides: {
      overview: { name: "Overview", html: "<p>Overview</p>" },
      verification: { name: "Verification", html, presenterNotes: "Keep these notes" },
    },
  },
});
const makeBoard = (blocks: Record<string, unknown>) => ({
  revision: 1, title: "Acceptance", blocks, blockOrder: Object.keys(blocks), connectors: {},
});
const proposal = (action: unknown) => JSON.stringify({ done: true, message: "Applying slide edit.", actions: [action] });

describe("runtime slide context and rename contract", () => {
  it("preserves slide IDs, names and existing content when the board requires compaction", () => {
    const blocks = {
      deck: makeDeck(),
      ...Object.fromEntries(Array.from({ length: 79 }, (_, index) => [`block-${index}`, {
        type: "text", description: "d".repeat(180), data: { markdown: "t".repeat(180) },
      }])),
    };
    const encoded = buildModelStepQuery({ query, canMutate: true }, makeBoard(blocks), [], []);
    const payload = JSON.parse(encoded);
    // Proves the shrinking path ran, rather than only testing a small board.
    expect(payload.board.blocks[1].title).toHaveLength(80);
    expect(payload.board.blocks[0]).toMatchObject({
      id: "deck", slideCount: 2,
      slides: [
        { id: "verification", name: "Verification", html: oldHtml, htmlTruncated: false, notes: "Keep these notes" },
        { id: "overview", name: "Overview" },
      ],
    });
    expect(payload.actionSchemas.update_slide.properties.name).toBeDefined();
    expect(encoded.length).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS);
  });

  it("can preserve the old bullet while adding one using the supplied complete slide HTML", () => {
    const deck = makeDeck();
    const board = makeBoard({ deck });
    const payload = JSON.parse(buildModelStepQuery({ query, canMutate: true }, board, [], []));
    const target = payload.board.blocks[0].slides.find((slide: { id: string }) => slide.id === "verification");
    const action = { type: "update_slide", blockId: "deck", slideId: target.id, html: target.html.replace("</ul>", "<li>Postdeploy slide check</li></ul>") };
    expect(parseWorkspaceModelProposal(proposal(action), board).actions).toEqual([action]);
    expect(applySlideAction(action, deck, "update_slide", {}, { strict: true })).toBe(true);
    expect(deck.data.slides.verification.html).toContain("Existing bullet");
    expect(deck.data.slides.verification.html).toContain("Postdeploy slide check");
    expect(deck.data.slideOrder).toHaveLength(2);
  });

  it("marks incomplete slide HTML so the planner cannot assume unseen content is empty", () => {
    const payload = JSON.parse(buildModelStepQuery({ query, canMutate: true }, makeBoard({ deck: makeDeck("x".repeat(12_001)) }), [], []));
    const target = payload.board.blocks[0].slides[0];
    expect(target.html).toHaveLength(12_000);
    expect(target.htmlTruncated).toBe(true);
    const guidance = payload.workspaceCapabilities.find((entry: { category: string }) => entry.category === "presentation").guidance;
    expect(guidance).toContain("do not rewrite unseen content");
  });

  it("includes a requested slide beyond the ordinary summary limit", () => {
    const slideOrder = Array.from({ length: 25 }, (_, index) => `slide-${index}`);
    const slides = Object.fromEntries(slideOrder.map((id, index) => [id, { name: `Page ${index}`, html: `<p>${index}</p>` }]));
    const board = makeBoard({ deck: { type: "slideDeck", data: { title: "Long deck", slideOrder, slides } } });
    const payload = JSON.parse(buildModelStepQuery({ query: "Update slide-24", canMutate: true }, board, [], []));
    expect(payload.board.blocks[0]).toMatchObject({ slideCount: 25 });
    expect(payload.board.blocks[0].slides[0]).toMatchObject({ id: "slide-24", name: "Page 24", html: "<p>24</p>" });
  });

  it("includes exact saved-frame IDs, names and order for frame actions", () => {
    const board = { ...makeBoard({}), frames: [
      { id: "frame-a", name: "Existing frame", order: 0, camera: { x: 10, y: 20, zoom: 1.5 } },
      { id: "frame-b", name: "Runtime test frame", order: 1, camera: { x: 30, y: 40, zoom: 2 } },
    ] };
    const payload = JSON.parse(buildModelStepQuery({ query: "Delete Runtime test frame", canMutate: true }, board, [], []));
    expect(payload.board.frames).toEqual([
      { id: "frame-a", name: "Existing frame", order: 0, cameraX: 10, cameraY: 20, cameraZoom: 1.5 },
      { id: "frame-b", name: "Runtime test frame", order: 1, cameraX: 30, cameraY: 40, cameraZoom: 2 },
    ]);
  });

  it("retains the exact saved-frame list when the board summary is compacted", () => {
    const blocks = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`block-${index}`, {
      type: "text", description: "d".repeat(180), data: { markdown: "t".repeat(180) },
    }]));
    const board = { ...makeBoard(blocks), frames: [{ id: "frame-a", name: "Retained frame", order: 0 }] };
    const payload = JSON.parse(buildModelStepQuery({ query: "Delete Retained frame", canMutate: true }, board, [], []));
    expect(payload.board.frames).toEqual([{ id: "frame-a", name: "Retained frame", order: 0 }]);
    expect(payload.board.blocks[0]).not.toHaveProperty("cells");
  });

  it("gives runtime a supported context contract while preserving the legacy tool guidance", () => {
    const runtime = selectWorkspaceCapabilities(query).find((entry) => entry.category === "presentation")!;
    expect(runtime.guidance).not.toContain("workspace_read");
    expect(runtime.guidance).toContain("Read saved frame IDs, names and order from board.frames");
    expect(runtime.guidance).toContain("board.blocks[].slides");
    expect(runtime.guidance).toContain("update_slide {blockId, slideId, name:<new name>}");
    expect(describeWorkspaceCapabilities(["presentation"])[0].guidance).toContain("workspace_read");
  });

  it("advertises and executes the same single-slide rename parameter", () => {
    const schema = WORKSPACE_RUNTIME_ACTION_SCHEMAS.update_slide;
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.newName).toBeUndefined();
    const deck = makeDeck();
    const board = makeBoard({ deck });
    const action = { type: "update_slide", blockId: "deck", slideId: "verification", name: "Verification postdeploy" };
    expect(parseWorkspaceModelProposal(proposal(action), board).actions).toEqual([action]);
    expect(applySlideAction(action, deck, "update_slide", {}, { strict: true })).toBe(true);
    expect(deck.data.slides.verification.name).toBe("Verification postdeploy");
    expect(deck.data.slides.verification.html).toBe(oldHtml);
    expect(() => parseWorkspaceModelProposal(proposal({ ...action, name: undefined, newName: "Wrong parameter" }), board)).toThrow(/unsupported fields/);
  });

  it("keeps newName valid for the bulk update contract", () => {
    const action = { type: "update_slides", blockId: "deck", slides: [{ slideId: "verification", newName: "Verification postdeploy" }] };
    expect(parseWorkspaceModelProposal(proposal(action), makeBoard({ deck: makeDeck() })).actions).toEqual([action]);
  });
});
