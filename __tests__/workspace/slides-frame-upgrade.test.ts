// @vitest-environment jsdom
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { compactSlideDeck } from "@/app/api/workspaces/[id]/agentSlideSummary";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { SlideChart } from "@/app/workspace/extensions/slideChart";
import { DocImage } from "@/app/workspace/extensions/docImage";
import { buildSlideLayoutHtml } from "@/app/api/workspaces/[id]/agent/slideLayouts";
import { parseSlideFields } from "@/app/api/workspaces/[id]/agent/slideFields";
import { sanitizeAgentHtml } from "@/app/api/workspaces/[id]/agent/agentHtmlSanitize";
import { applyFrameAction, resolveFrameCamera } from "@/app/api/workspaces/[id]/agent/frameOperations";
import { collectDragBlockIds } from "@/app/workspace/hooks/blockDragTypes";
import { wrapBlocksInFrame } from "@/app/api/workspaces/[id]/agent/operationsContainerFrame";
import type { AgentBoardState } from "@/app/api/workspaces/[id]/agent/operationsCore";
import { SlideThumbnail } from "@/app/workspace/components/slides/SlideThumbnail";

afterEach(() => cleanup());

function editor(html: string) {
  return new Editor({ extensions: [StarterKit, TableKit, SlideChart, DocImage], content: html });
}
function board(): AgentBoardState {
  return { title: "Test", blockOrder: ["a", "b"], connectors: {}, blocks: {
    a: { id: "a", type: "text", data: { markdown: "Alpha" }, transform: { override: { x: 100, y: 100, w: 200, h: 100, zIndex: 1 } } },
    b: { id: "b", type: "text", data: { markdown: "Beta" }, transform: { override: { x: 600, y: 100, w: 200, h: 100, zIndex: 2 } } },
  } };
}
describe("slide data and persistence", () => {
  it("keeps chart values, proportions and escaped labels after two real editor reloads", () => {
    const fields = parseSlideFields({ layout: "bar-chart", title: "Results", series: [{ label: '<img src=x onerror="bad()">', value: 10 }, { label: "B", value: 20 }], transition: "zoom", animation: "rise" }, { allowLayout: true, strict: true });
    expect(fields.ok).toBe(true);
    if (!fields.ok) return;
    const first = editor(String(fields.set.html));
    const html = first.getHTML(); first.destroy();
    const second = editor(sanitizeAgentHtml(html, { allowStyle: true }));
    expect(second.getJSON().content?.find((item) => item.type === "slideChart")?.attrs?.series).toEqual([{ label: '<img src=x onerror="bad()">', value: 10 }, { label: "B", value: 20 }]);
    const dom = new DOMParser().parseFromString(second.getHTML(), "text/html");
    expect(dom.querySelectorAll("img")).toHaveLength(0);
    expect(dom.querySelector("td p")?.getAttribute("style")).toContain("width: 50%");
    expect(fields.set).toMatchObject({ transition: "zoom", animation: "rise" });
    second.destroy();
  });
  it("scales fractional values correctly and renders zero as an empty bar", () => {
    const instance = editor(buildSlideLayoutHtml("bar-chart", { series: [{ label: "Zero", value: 0 }, { label: "Small", value: 0.5 }] }));
    const dom = new DOMParser().parseFromString(instance.getHTML(), "text/html");
    const rows = dom.querySelectorAll("tr");
    expect(rows[0].querySelector("td p")?.getAttribute("style")).toContain("width: 0%");
    expect(rows[1].querySelector("td p")?.getAttribute("style")).toContain("width: 100%");
    expect(rows[0].textContent).toContain("0"); instance.destroy();
  });
  it("keeps table cells and images through the editor", () => {
    const html = buildSlideLayoutHtml("data-table", { columns: ["Quarter", "Revenue"], rows: [["Q2", "10"], ["Q3", "12.4"]] }) + buildSlideLayoutHtml("image-caption", { imageUrl: "/images/test.png", caption: "Evidence" });
    const instance = editor(html);
    expect(instance.getHTML()).toContain("12.4");
    expect(instance.getHTML()).toContain('src="/images/test.png"');
    expect(instance.getJSON().content?.find((item) => item.type === "table")).toBeDefined();
    instance.destroy();
  });
  it.each([
    { layout: "data-table", columns: ["A", "B"], rows: [["only one"]] },
    { layout: "bar-chart", series: [{ label: "A", value: Infinity }] },
    { layout: "bar-chart", series: [{ label: "A", value: -1 }] },
    { transition: "unsupported", name: "Must not save" },
    { animation: "spin" },
  ])("rejects unusable input atomically: %j", (input) => {
    expect(parseSlideFields(input, { allowLayout: true }).ok).toBe(false);
  });
});
describe("content-linked frames", () => {
  it("deletes one uniquely named camera frame and reorders the remaining exact IDs", () => {
    const state = board();
    state.frames = [
      { id: "frame-a", name: "Keep frame", order: 0, camera: { x: 0, y: 0, zoom: 1 } },
      { id: "frame-b", name: "Runtime test frame", order: 1, camera: { x: 10, y: 20, zoom: 2 } },
    ];
    expect(applyFrameAction(state, { frameName: "Runtime test frame" }, "delete_frame")).toBe(true);
    expect(state.frames).toEqual([{ id: "frame-a", name: "Keep frame", order: 0, camera: { x: 0, y: 0, zoom: 1 } }]);
    state.frames = [
      { id: "frame-a", name: "Keep frame", order: 0, camera: { x: 0, y: 0, zoom: 1 } },
      { id: "frame-c", name: "Other frame", order: 1, camera: { x: 30, y: 40, zoom: 3 } },
    ];
    expect(applyFrameAction(state, { frameIds: ["frame-c", "frame-a"] }, "reorder_frames")).toBe(true);
    expect(state.frames).toMatchObject([
      { id: "frame-c", name: "Other frame", order: 0 },
      { id: "frame-a", name: "Keep frame", order: 1 },
    ]);
  });

  it("returns the affected frame IDs and exact saved-frame summaries", () => {
    const state = board();
    state.frames = [{ id: "frame-a", name: "Acceptance frame", order: 0, camera: { x: 0, y: 0, zoom: 1 } }];
    const deleted = applyAgentAction(state, { type: "delete_frame", frameName: "Acceptance frame" });
    expect(deleted).toMatchObject({ ids: ["frame-a"], summary: 'deleted frame "Acceptance frame"' });
    const created = applyAgentAction(state, { type: "create_frame", name: "Postdeploy frame", blockIds: ["a"] });
    expect(created.ids).toHaveLength(1);
    expect(created.summary).toBe('created frame "Postdeploy frame"');
  });

  it("persists membership, skip flag and notes; focusing recomputes the moved content", () => {
    const state = board();
    expect(applyFrameAction(state, { name: "Start", blockIds: ["Alpha"], presenterNotes: "Speak", hiddenInPresentation: true }, "create_frame")).toBe(true);
    const frame = (state.frames as Array<{ id: string; camera: object; blockIds: string[] }>)[0];
    expect(frame.blockIds).toEqual(["a"]);
    const old = resolveFrameCamera(state, { frameId: frame.id }).camera;
    (state.blocks.a.transform as { override: { x: number } }).override.x += 500;
    expect(resolveFrameCamera(state, { frameId: frame.id }).camera).not.toEqual(old);
    expect(JSON.parse(JSON.stringify(state.frames))[0]).toMatchObject({ presenterNotes: "Speak", hiddenInPresentation: true });
    expect(applyFrameAction(state, { frameId: frame.id, camera: { x: 0, y: 0, zoom: 1 } }, "update_frame")).toBe(true);
    expect((state.frames as Array<{blockIds?: string[]}>)[0].blockIds).toBeUndefined();
  });
  it("rejects partial target matches and invalid cameras without saving", () => {
    const state = board();
    expect(applyFrameAction(state, { blockIds: ["a", "missing"] }, "create_frame")).toBe(false);
    expect(applyFrameAction(state, { camera: { x: 0, y: 0, zoom: Infinity } }, "create_frame")).toBe(false);
    expect(state.frames).toBeUndefined();
  });
  it("AI movement translates linked content without detaching tree relationships", () => {
    const state = board();
    const ids = wrapBlocksInFrame(state, { blockIds: ["a", "b"], movable: true });
    const rect = (state.blocks[ids[0]].transform as { override: { x: number; y: number } }).override;
    const result = applyAgentAction(state, { type: "update_transform", blockId: ids[0], transform: { x: rect.x + 100, y: rect.y + 80 } });
    expect(result.ids).toContain("a"); expect(result.ids).toContain("b");
    expect((state.blocks.a.transform as { override: object }).override).toMatchObject({ x: 200, y: 180 });
    expect((state.blocks.b.transform as { override: object }).override).toMatchObject({ x: 700, y: 180 });
  });
  it("creates a rich deck through the shared AI executor and reads motion settings back", () => {
    const state = board();
    const result = applyAgentAction(state, { type: "create_slide_deck", title: "Report", slides: [
      { layout: "data-table", title: "Data", columns: ["Period", "Value"], rows: [["Q3", "12.4"]], transition: "fade", animation: "rise" },
      { layout: "bar-chart", title: "Chart", series: [{ label: "Q2", value: 10 }, { label: "Q3", value: 12.4 }] },
      { layout: "image-caption", title: "Photo", imageUrl: "/images/test.png" },
    ] });
    expect(result.ids).toHaveLength(1);
    const data = state.blocks[result.ids[0]].data as Record<string, unknown>;
    const slides = compactSlideDeck(JSON.parse(JSON.stringify(data))).slides as Array<Record<string,unknown>>;
    expect(slides).toHaveLength(3);
    expect(slides[0]).toMatchObject({ transition: "fade", animation: "rise" });
  });
  it("movable containers drag each member once, including nested/cyclic membership", () => {
    const state = board();
    const ids = wrapBlocksInFrame(state, { blockIds: ["a", "b"], title: "Team", movable: true });
    const blocks = state.blocks as unknown as Parameters<typeof collectDragBlockIds>[0];
    const members = collectDragBlockIds(blocks, ids[0], [ids[0], "a"]);
    expect(new Set(members)).toEqual(new Set([ids[0], ids[1], "a", "b"]));
    expect(members.length).toBe(4);
    blocks.b.data = { frameBlockIds: [ids[0]] };
    expect(collectDragBlockIds(blocks, ids[0], [ids[0]])).toHaveLength(4);
  });
});


it("rejects unsupported chart layout CSS atomically and keeps structured charts editable", () => {
  const state: AgentBoardState = { title: "t", blocks: {}, blockOrder: [], connectors: {} };
  const before = structuredClone(state);
  const bad = applyAgentAction(state, { type: "create_slide_deck", title: "Chart", slides: [{ layout: "title", title: "Intro" }, { html: '<div style="display:flex"><p>120</p></div>' }] });
  expect(bad.reason).toContain("unsupported layout CSS"); expect(state).toEqual(before);
  const good = applyAgentAction(state, { type: "create_slide_deck", title: "Chart", slides: [{ layout: "bar-chart", title: "Revenue", series: [{ label: "North", value: 120 }, { label: "South", value: 150 }] }] });
  expect(good.ids).toHaveLength(1);
  const data = state.blocks[good.ids[0]].data as any;
  expect(data.slides[data.slideOrder[0]].html).toContain('data-slide-chart="bar"');
  expect(data.slides[data.slideOrder[0]].html).toContain("&quot;value&quot;:120");
});

it("compact slide reads expose uploaded images and image moves preserve the original on invalid input", () => {
  const state: AgentBoardState = { title: "t", blocks: {}, blockOrder: [], connectors: {} };
  const deckId = applyAgentAction(state, { type: "create_slide_deck", slides: [
    { layout: "image-caption", imageUrl: "/api/workspace-images/uploaded", caption: "Uploaded photo" },
    { layout: "title", title: "Destination" },
  ] }).ids[0];
  const data = state.blocks[deckId].data as any;
  const source = data.slideOrder[0], target = data.slideOrder[1];
  const summary = compactSlideDeck(data).slides as any[];
  expect(summary[0].images).toEqual([{ src: "/api/workspace-images/uploaded", alt: "Uploaded photo" }]);
  const before = structuredClone(state);
  const failed = applyAgentAction(state, { type: "update_slides", blockId: deckId, slides: [
    { slideId: source, layout: "title", title: "Cleared source" },
    { slideId: target, layout: "image-caption", caption: "Photo" },
  ] });
  expect(failed.reason).toContain("imageUrl"); expect(state).toEqual(before);
  const moved = applyAgentAction(state, { type: "update_slides", blockId: deckId, slides: [
    { slideId: source, layout: "title", title: "Cleared source" },
    { slideId: target, layout: "image-caption", imageUrl: summary[0].images[0].src, caption: "Photo" },
  ] });
  expect(moved.ids).toHaveLength(1);
  const after = compactSlideDeck(state.blocks[deckId].data as any).slides as any[];
  expect(after[0].images).toBeUndefined();
  expect(after[1].images[0].src).toBe("/api/workspace-images/uploaded");
});

it("does not reselect a slide when a settings-menu action runs through its portal", async () => {
  const onSelect = vi.fn();
  const onDelete = vi.fn();
  render(createElement(SlideThumbnail, {
    slide: { id: "slide-b", name: "Temporary", html: "" },
    index: 1,
    isActive: true,
    canDelete: true,
    onSelect,
    onDragStart: () => {},
    onDragOver: () => {},
    onDrop: () => {},
    onRename: () => {},
    onDuplicate: () => {},
    onDelete,
    onSetStatus: () => {},
    onSetBackground: () => {},
    onSetNotes: () => {},
    onSetHidden: () => {},
  }));

  fireEvent.click(screen.getByRole("button", { name: "Slide settings" }));
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

  expect(onDelete).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
});
