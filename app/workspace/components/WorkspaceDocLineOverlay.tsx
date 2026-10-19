"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceViewportControls } from "../hooks/useWorkspaceViewportControls";
import { WorkspaceDocLineMenu } from "./WorkspaceDocLineMenu";
import { docLineAtPosition, docLineElement, findDocLine } from "../utils/docLineTargets";

interface HoverLine {
  lineId: string;
  top: number;
}

/** `editor.view.nodeDOM(pos)` is the "correct" way to resolve a line's DOM
 *  element, but is flaky at document-start boundaries (position 0 sometimes
 *  resolves to the ProseMirror root instead of the first paragraph) — since
 *  DocLineId (../extensions/docLineId.ts) already stamps `data-line-id` on
 *  every line, querying for it directly is both simpler and immune to that
 *  edge case. */
function lineDom(container: HTMLElement, lineId: string): HTMLElement | null {
  return docLineElement(container, lineId);
}

/** offsetTop is relative to the element's OWN offsetParent, not necessarily
 *  `container` — TipTap's ProseMirror div sets `position: relative` on
 *  itself, so a line's offsetParent is that inner div, not the outer
 *  container the ⋮ button is positioned within (they differ by the
 *  container's own padding, which is what caused the button to land above
 *  its row). Walk the offsetParent chain up to `container`, summing as we
 *  go, so the result is local/untransformed (immune to canvas zoom, see
 *  lineAtClientPoint below) AND relative to the right ancestor. */
function offsetTopWithin(el: HTMLElement, container: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

function lineAtClientPoint(editor: Editor, container: HTMLElement, clientX: number, clientY: number): HoverLine | null {
  if (editor.isDestroyed) return null;
  const result = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!result) return null;
  const target = docLineAtPosition(editor.state.doc, result.pos);
  const lineId = target?.node.attrs.lineId as string | undefined;
  const dom = lineId ? lineDom(container, lineId) : null;
  return lineId && dom ? { lineId, top: offsetTopWithin(dom, container) } : null;
}

/** Hover-tracks the doc/slideDeck line under the pointer (while editing) and
 *  mounts WorkspaceDocLineMenu's ⋮ button beside it — the paragraph-level
 *  analog of WorkspaceSelectionToolbar's block-level popovers. Also owns the
 *  "Copy link to block" landing behavior: watches pendingFocusLineId
 *  (set from a ?focusLine= URL param) and scrolls/highlights the matching
 *  line once this editor's document contains it. */
export function WorkspaceDocLineOverlay({
  editor,
  blockId,
  containerRef,
  isEditing,
}: {
  editor: Editor | null;
  blockId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  isEditing: boolean;
}) {
  const [hover, setHover] = useState<HoverLine | null>(null);
  // Pinned to the currently-open line's id while its ⋮ menu is open, so the
  // button+popover survive the mouseleave that fires the instant the pointer
  // crosses from the button into the popover — which is portaled to
  // document.body via WorkspaceSmartPopover and so sits outside containerRef
  // (without this, the menu closed itself the moment you moved toward it,
  // before any item could be clicked).
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const highlight = useRef<Animation | null>(null);
  const pendingFocusLineId = useWorkspaceStore((state) => state.pendingFocusLineId);
  const selectedBlockId = useWorkspaceStore((state) => state.selectedBlockIds[0]);
  const setPendingFocusLineId = useWorkspaceStore((state) => state.setPendingFocusLineId);
  const { centerOnBlock } = useWorkspaceViewportControls();

  useEffect(() => {
    if (!editor || !isEditing) {
      setHover(null);
      setOpenLineId(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (event: MouseEvent) => {
      if (openLineId) return;
      setHover(lineAtClientPoint(editor, container, event.clientX, event.clientY));
    };
    const handleLeave = () => {
      if (!openLineId) setHover(null);
    };
    const handleSelection = () => {
      if (openLineId || editor.isDestroyed) return;
      const target = docLineAtPosition(editor.state.doc, editor.state.selection.head);
      const id = target?.node.attrs.lineId as string | undefined;
      const dom = id ? lineDom(container, id) : null;
      if (id && dom) setHover({ lineId: id, top: offsetTopWithin(dom, container) });
    };

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("mouseleave", handleLeave);
    editor.on("selectionUpdate", handleSelection);
    return () => {
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("mouseleave", handleLeave);
      editor.off("selectionUpdate", handleSelection);
    };
  }, [editor, isEditing, containerRef, openLineId]);

  useEffect(() => {
    if (!editor || !pendingFocusLineId || selectedBlockId !== blockId) return;
    const focus = () => {
      if (editor.isDestroyed || !containerRef.current) return;
      const target = findDocLine(editor.state.doc, pendingFocusLineId);
      if (!target) return;
      const dom = lineDom(containerRef.current, target.node.attrs.lineId || pendingFocusLineId);
      if (!dom) return;
      centerOnBlock(blockId);
      dom.scrollIntoView({ block: "center", behavior: "smooth" });
      highlight.current?.cancel();
      highlight.current = dom.animate?.([{ backgroundColor: "#fef08a" }, { backgroundColor: "transparent" }], { duration: 1600 }) ?? null;
      setPendingFocusLineId(null);
    };
    focus();
    editor.on("transaction", focus);
    return () => { editor.off("transaction", focus); };
  }, [editor, pendingFocusLineId, blockId, selectedBlockId, centerOnBlock, setPendingFocusLineId, containerRef]);
  useEffect(() => () => { highlight.current?.cancel(); }, []);

  if (!editor || !isEditing || !hover) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 z-10"
      style={{ top: hover.top, transform: "translate(2px, 1px)" }}
    >
      <div className="pointer-events-auto">
        <WorkspaceDocLineMenu
          editor={editor}
          blockId={blockId}
          lineId={hover.lineId}
          isOpen={openLineId === hover.lineId}
          onOpenChange={(isOpen) => setOpenLineId(isOpen ? hover.lineId : null)}
        />
      </div>
    </div>
  );
}

export default WorkspaceDocLineOverlay;
