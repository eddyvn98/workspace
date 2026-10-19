"use client";

import React, { useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Download, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { docImageAlign, docImageWidth, MIN_DOC_IMAGE_WIDTH, safeDocImageUrl } from "../utils/docImageAttributes";
import { useDocImageEditable, useDocImageReplacement, useDocImageResize } from "../hooks/useDocImageControls";

const buttonClass = "flex items-center justify-center rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;
const inputClass = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900";

export function WorkspaceDocImageNodeView(props: NodeViewProps) {
  const { node, editor, updateAttributes, deleteNode, selected } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const editable = useDocImageEditable(editor);
  const replacement = useDocImageReplacement(props, editable);
  const align = docImageAlign(node.attrs.align);
  const resize = useDocImageResize(props, wrapperRef, align, editable);
  const src = safeDocImageUrl(node.attrs.src) ?? undefined;
  const downloadUrl = safeDocImageUrl(node.attrs.downloadUrl) ?? src;
  const alt = String(node.attrs.alt ?? "");
  const caption = String(node.attrs.caption ?? "");
  const width = resize.draft ?? docImageWidth(node.attrs.width);
  const percent = Number.parseFloat(width);
  const canEdit = () => !editor.isDestroyed && editor.isEditable;
  const update = (attrs: Record<string, unknown>) => { if (canEdit()) updateAttributes(attrs); };

  return (
    <NodeViewWrapper className="my-2" contentEditable={false}>
      <div ref={wrapperRef} style={{ display: "flex", justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
        <figure className="relative m-0" style={{ width, maxWidth: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} title={node.attrs.title || undefined} draggable={false} className={`block h-auto w-full rounded ${selected ? "outline outline-2 outline-blue-500" : ""}`} />
          {caption && <figcaption className="mt-1 whitespace-pre-wrap break-words text-center text-sm text-slate-500 dark:text-slate-400">{caption}</figcaption>}
          {selected && editable && (
            <>
              <div role="toolbar" aria-label="Image controls" onPointerDown={(event) => event.stopPropagation()}
                className="absolute -top-11 left-0 z-20 flex w-max max-w-[calc(100vw-4rem)] flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md dark:border-slate-800 dark:bg-slate-900/95">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => (
                  <button key={value} type="button" title={`Align ${value}`} aria-label={`Align image ${value}`} aria-pressed={align === value}
                    className={align === value ? activeButtonClass : buttonClass} onClick={() => update({ align: value })}><Icon className="h-3.5 w-3.5" /></button>
                ))}
                <button type="button" title="Image details" aria-label="Image details" aria-expanded={detailsOpen} className={buttonClass} onClick={() => setDetailsOpen(!detailsOpen)}><Settings2 className="h-3.5 w-3.5" /></button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0]; event.target.value = "";
                  if (file) void replacement.replace(file);
                }} />
                <button type="button" title="Replace image" aria-label="Replace image" disabled={replacement.status === "uploading"} className={buttonClass} onClick={() => fileInputRef.current?.click()}><RefreshCw className="h-3.5 w-3.5" /></button>
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download={alt || undefined} title="Download original image" aria-label="Download original image" className={buttonClass}><Download className="h-3.5 w-3.5" /></a>
                <button type="button" title="Delete image" aria-label="Delete image" className={buttonClass} onClick={() => { if (canEdit()) { replacement.cancel(); deleteNode(); } }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <button type="button" role="slider" aria-label="Image width" aria-valuemin={MIN_DOC_IMAGE_WIDTH} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`}
                onPointerDown={resize.start} onKeyDown={(event) => {
                  const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
                  if (delta || event.key === "Home" || event.key === "End") {
                    event.preventDefault(); event.stopPropagation();
                    update({ width: docImageWidth(event.key === "Home" ? MIN_DOC_IMAGE_WIDTH : event.key === "End" ? 100 : percent + delta * (event.shiftKey ? 5 : 1)), height: null });
                  }
                }} title="Resize image (drag or use arrow keys)"
                className={`absolute bottom-0 h-4 w-4 translate-y-1/2 touch-none cursor-nwse-resize rounded-sm border-2 border-white bg-blue-500 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${align === "right" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`} />
            </>
          )}
        </figure>
      </div>
      {selected && editable && detailsOpen && (
        <div className="mt-3 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" onPointerDown={(event) => event.stopPropagation()}>
          <label>Alt text<input className={inputClass} value={alt} placeholder="Describe the image for screen readers" onChange={(event) => update({ alt: event.target.value })} /></label>
          <label>Caption<input className={inputClass} value={caption} placeholder="Optional caption" onChange={(event) => update({ caption: event.target.value })} /></label>
          <label>Image width: {percent}%<input aria-label="Image width percent" className="block w-full" type="range" min={MIN_DOC_IMAGE_WIDTH} max={100} step={1} value={percent} onChange={(event) => update({ width: docImageWidth(event.target.value), height: null })} /></label>
        </div>
      )}
      {replacement.status !== "idle" && editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" onPointerDown={(event) => event.stopPropagation()}>
          <span role={replacement.status === "error" ? "alert" : "status"}>{replacement.status === "uploading" ? "Uploading replacement…" : replacement.error}</span>
          {replacement.status === "error" && replacement.canRetry && <button type="button" className="underline" onClick={replacement.retry}>Retry</button>}
          <button type="button" className="underline" onClick={replacement.cancel}>Cancel</button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export default WorkspaceDocImageNodeView;
