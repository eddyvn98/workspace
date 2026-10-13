"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { anchorRegistry } from "../connectors/anchorRegistry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { Transform } from "../types/block";

export function useBlockFrameGeometry(
  blockId: string,
  rootRef: RefObject<HTMLDivElement>,
  transform: Transform,
  isSlideDeckBlock: boolean,
  isLocked: boolean,
  effectiveReadOnly: boolean,
) {
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  // Double-click-to-fit: se grows the frame's height to match its content's
  // natural (unclipped) height at the current width, ne grows width to match
  // content that overflows horizontally (e.g. a wide embedded table) at the
  // current height. Only wired for doc blocks - see BlockFrameOverlays'
  // per-corner onDoubleClick. `.workspace-doc-rich-editor` is the
  // overflow:auto content wrapper inside WorkspaceDocRichEditor, so its
  // scrollHeight/scrollWidth reflect the full content size even while
  // visually clipped by the frame's current dimensions.
  const handleAutoFitHeight = useCallback(() => {
    if (isLocked || effectiveReadOnly) return;
    const content = rootRef.current?.querySelector(".workspace-doc-rich-editor");
    if (!content) return;
    updateBlockTransform(blockId, { h: Math.max(60, content.scrollHeight) }, "override");
  }, [blockId, effectiveReadOnly, isLocked, updateBlockTransform]);

  const handleAutoFitWidth = useCallback(() => {
    if (isLocked || effectiveReadOnly) return;
    const content = rootRef.current?.querySelector(".workspace-doc-rich-editor");
    if (!content) return;
    updateBlockTransform(blockId, { w: Math.max(120, content.scrollWidth) }, "override");
  }, [blockId, effectiveReadOnly, isLocked, updateBlockTransform]);

  useEffect(() => {
    if (!isSlideDeckBlock || isLocked || effectiveReadOnly) return;
    const editor = rootRef.current?.querySelector<HTMLElement>(".workspace-doc-rich-editor .ProseMirror");
    if (!editor) return;
    let frame = 0;
    const fitHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const contentHeight = editor.scrollHeight + 120;
        const height = Math.max(360, Math.min(1600, contentHeight));
        const wrapper = rootRef.current?.querySelector<HTMLElement>(".workspace-doc-rich-editor");
        const horizontalOverflow = Math.max(0, editor.scrollWidth - editor.clientWidth, (wrapper?.scrollWidth ?? 0) - (wrapper?.clientWidth ?? 0));
        const width = Math.max(480, Math.min(1600, transform.w + horizontalOverflow));
        const patch = {
          ...(Math.abs(transform.h - height) > 2 ? { h: height } : {}),
          ...(Math.abs(transform.w - width) > 2 ? { w: width } : {}),
        };
        if (Object.keys(patch).length) updateBlockTransform(blockId, patch, "override");
      });
    };
    const observer = new MutationObserver(fitHeight);
    observer.observe(editor, { childList: true, characterData: true, subtree: true, attributes: true });
    fitHeight();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [blockId, effectiveReadOnly, isLocked, isSlideDeckBlock, transform.h, transform.w, updateBlockTransform]);


  return { handleAutoFitHeight, handleAutoFitWidth };
}

export function useBlockFrameAnchors(blockId: string, rootRef: RefObject<HTMLDivElement>, transform: Transform): void {
  // Connectors anchor to canvas coordinates, so the registry needs the live
  // transform (including the resize/drag previews that never reach the store)
  // without re-registering on every pointer move — a ref read lazily inside
  // getWorldRect stays current while the registration itself stays stable.
  const worldRectRef = useRef(transform);
  worldRectRef.current = transform;

  useEffect(() => {
    const unregister = anchorRegistry.register(blockId, {
      getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
      getWorldRect: () => {
        const current = worldRectRef.current;
        return new DOMRect(current.x, current.y, current.w, current.h);
      },
    });

    const element = rootRef.current;
    let observer: ResizeObserver | null = null;

    if (element && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        anchorRegistry.refresh(blockId);
      });
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      if (typeof unregister === "function") {
        unregister();
      }
    };
  }, [blockId]);

  // A preview transform lives in local state, so nothing in the store tells
  // the connector layer to redraw — notify the registry ourselves.
  useEffect(() => {
    anchorRegistry.refresh(blockId);
  }, [blockId, transform.x, transform.y, transform.w, transform.h]);


}
