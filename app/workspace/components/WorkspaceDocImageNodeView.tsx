"use client";

import React, { useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Download, RefreshCw, Trash2 } from "lucide-react";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";

const buttonClass = "flex items-center justify-center rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;
const MIN_WIDTH_PERCENT = 15;

type Align = "left" | "center" | "right";

/**
 * NodeView for an image dropped into a doc block. Mirrors
 * WorkspaceImageSelectionToolbar.tsx's Replace/Download actions plus
 * Align left/center/right and a corner resize handle, on a small floating
 * bar shown above the image while it's the current ProseMirror node
 * selection — the same "select the image, get the image block's own
 * toolbar" behavior Miro uses for images embedded in a document.
 *
 * `selected` is TipTap's own node-selection flag, not this app's canvas
 * `isSelected` — no zoom-aware coordinate math is needed for the toolbar
 * (unlike WorkspaceDocLineOverlay's ⋮ button) since it's positioned via
 * plain CSS relative to this node's own wrapper. The resize handle DOES
 * cross the canvas's zoom transform, but sidesteps it entirely by working
 * in percentages of the wrapper's own (already-zoomed) screen width rather
 * than converting a pixel delta — the ratio is scale-invariant.
 */
export function WorkspaceDocImageNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startPercent: number; containerWidth: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<string | null>(null);

  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string | null) ?? "";
  const align = ((node.attrs.align as string) || "center") as Align;
  const width = dragWidth ?? (node.attrs.width as string) ?? "100%";
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  const handleReplace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const uploaded = await uploadWorkspaceImageWithOriginal(file);
    if (!uploaded) return;
    updateAttributes({ src: uploaded.url, alt: file.name });
  };

  const handleResizeStart = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const containerWidth = wrapperRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return;
    const startPercent = parseFloat(String(node.attrs.width)) || 100;
    dragStateRef.current = { startX: event.clientX, startPercent, containerWidth };

    const handleMove = (moveEvent: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const deltaPercent = ((moveEvent.clientX - state.startX) / state.containerWidth) * 100;
      const next = Math.min(100, Math.max(MIN_WIDTH_PERCENT, state.startPercent + deltaPercent));
      setDragWidth(`${Math.round(next)}%`);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragStateRef.current = null;
      setDragWidth((current) => {
        if (current) updateAttributes({ width: current });
        return null;
      });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <NodeViewWrapper className="my-1">
      <div ref={wrapperRef} style={{ display: "flex", justifyContent: justify }}>
        <div className="relative" style={{ width, maxWidth: "100%" }}>
          {/* The editor resizes images by width and relies on intrinsic height from user-provided URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} draggable={false} className={`block w-full rounded ${selected ? "outline outline-2 outline-blue-500" : ""}`} />
          {selected && (
            <div
              contentEditable={false}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute -top-10 left-0 z-10 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-1 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
            >
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  title={`Align ${value}`}
                  aria-label={`Align ${value}`}
                  aria-pressed={align === value}
                  className={align === value ? activeButtonClass : buttonClass}
                  onClick={() => updateAttributes({ align: value })}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleReplace} style={{ display: "none" }} />
              <button type="button" title="Replace image" aria-label="Replace image" className={buttonClass} onClick={() => fileInputRef.current?.click()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <a href={src} target="_blank" rel="noopener noreferrer" download={alt || undefined} title="Download" aria-label="Download" className={buttonClass}>
                <Download className="h-3.5 w-3.5" />
              </a>
              <button type="button" title="Delete image" aria-label="Delete image" className={buttonClass} onClick={() => deleteNode()}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {selected && (
            <div
              onPointerDown={handleResizeStart}
              title="Drag to resize"
              className="absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border-2 border-white bg-blue-500 shadow"
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export default WorkspaceDocImageNodeView;
