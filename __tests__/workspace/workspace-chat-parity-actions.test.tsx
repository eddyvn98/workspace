// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreehandDraw } from "@/app/workspace/hooks/useFreehandDraw";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { createDualTransform, type CanvasBlock } from "@/app/workspace/types/block";
import { applyWorkspaceParityChatAction } from "@/app/workspace/utils/workspaceChatParityActions";
import { applyWorkspaceLegacyChatAction } from "@/app/workspace/utils/workspaceChatLegacyActions";

describe("Workspace client command parity actions", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ blocks: {}, blockOrder: [], connectors: {}, selectedBlockIds: [], isReadOnly: false });
  });

  it("creates a standalone block and selects it", () => {
    const ids = applyWorkspaceParityChatAction({ type: "create_block", blockType: "doc", data: { html: "<p>Hello</p>" } });
    const block = useWorkspaceStore.getState().blocks[ids?.[0] ?? ""];

    expect(ids).toHaveLength(1);
    expect(block).toMatchObject({ type: "doc", data: { html: "<p>Hello</p>" } });
    expect(useWorkspaceStore.getState().selectedBlockIds).toEqual(ids);
  });

  it("applies transform and paint-order mutations through store APIs", () => {
    const first = applyWorkspaceParityChatAction({ type: "create_block", blockType: "text", text: "A" })![0];
    const second = applyWorkspaceParityChatAction({ type: "create_block", blockType: "text", text: "B" })![0];

    applyWorkspaceParityChatAction({ type: "update_transform", blockId: first, transform: { x: 420, rotation: 20 } });
    applyWorkspaceParityChatAction({ type: "update_z_order", blockId: first, zOrder: "front" });

    expect(useWorkspaceStore.getState().blocks[first].transform.override).toMatchObject({ x: 420, rotation: 20 });
    expect(useWorkspaceStore.getState().blockOrder).toEqual([second, first]);
  });

  it("removes a connector by its two endpoints", () => {
    useWorkspaceStore.setState({
      blocks: {
        a: { id: "a", type: "text", data: { markdown: "A" }, transform: { computed: null, override: { x: 0, y: 0, w: 100, h: 50, rotation: 0, zIndex: 0 } }, createdAt: 1, updatedAt: 1 },
        b: { id: "b", type: "text", data: { markdown: "B" }, transform: { computed: null, override: { x: 200, y: 0, w: 100, h: 50, rotation: 0, zIndex: 1 } }, createdAt: 1, updatedAt: 1 },
      },
      blockOrder: ["a", "b"],
      connectors: { link: { id: "link", fromBlockId: "a", toBlockId: "b" } },
    });

    expect(applyWorkspaceParityChatAction({ type: "disconnect_nodes", fromBlockId: "a", toBlockId: "b" })).toEqual(["link"]);
    expect(useWorkspaceStore.getState().connectors).toEqual({});
  });

  it("applies rich text style and replaces or removes attached images", () => {
    const id = applyWorkspaceParityChatAction({ type: "create_block", blockType: "text", text: "Styled" })![0];
    expect(applyWorkspaceLegacyChatAction({ type: "update_style", blockId: id, style: { fontSize: 24, fontUnderline: true, align: "center" } })).toEqual([id]);
    expect(useWorkspaceStore.getState().blocks[id].data).toMatchObject({ fontSize: 24, fontUnderline: true, align: "center" });

    useWorkspaceStore.getState().updateBlock(id, { attachedImages: [{ url: "one" }, { url: "two" }] });
    expect(applyWorkspaceLegacyChatAction({ type: "update_image", blockId: id, images: [{ url: "three", alt: "Three" }] })).toEqual([id]);
    expect(useWorkspaceStore.getState().blocks[id].attachedImages).toEqual([{ url: "three", alt: "Three" }]);
    expect(applyWorkspaceLegacyChatAction({ type: "update_image", blockId: id, removeImageIndex: 0 })).toEqual([id]);
    expect(useWorkspaceStore.getState().blocks[id].attachedImages).toBeUndefined();
    expect(applyWorkspaceLegacyChatAction({ type: "update_icon", blockId: id, icon: "⭐" })).toEqual([id]);
    expect(useWorkspaceStore.getState().blocks[id].icon).toBe("⭐");
    expect(applyWorkspaceLegacyChatAction({ type: "update_icon", blockId: id, icon: "" })).toEqual([id]);
    expect(useWorkspaceStore.getState().blocks[id].icon).toBe("");
  });

  it("erases a path when pointerdown targets the path block instead of the canvas background", () => {
    const path = {
      id: "path-1",
      type: "path",
      transform: createDualTransform({ x: 2, y: 2, w: 26, h: 26, rotation: 0, zIndex: 0 }),
      data: { points: [{ x: 8, y: 8 }, { x: 20, y: 20 }], strokeColor: "#000000", strokeWidth: 2, tool: "pen", opacity: 1 },
      createdAt: 1,
      updatedAt: 1,
    } as CanvasBlock<"path">;
    useWorkspaceStore.setState({
      blocks: { [path.id]: path },
      blockOrder: [path.id],
      isDrawMode: true,
      activeFreehandTool: "eraser",
      camera: { x: 0, y: 0, zoom: 1, activeFrameId: null },
    });

    let api!: ReturnType<typeof useFreehandDraw>;
    function Host() { api = useFreehandDraw(); return null; }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Host />));
    const canvas = document.createElement("div");
    const target = document.createElement("div");
    canvas.append(target);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    canvas.setPointerCapture = vi.fn();
    const event = {
      button: 0, defaultPrevented: true, target, currentTarget: canvas,
      clientX: 15, clientY: 15, pointerId: 1, preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<HTMLDivElement>;

    act(() => api.onPointerDown(event));
    expect(useWorkspaceStore.getState().blocks[path.id]).toBeUndefined();
    act(() => root.unmount());
  });
});
