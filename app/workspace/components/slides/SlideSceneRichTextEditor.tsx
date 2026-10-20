"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideSceneObject } from "../../types/slideScene";
import { richTextFromObject, resolvedSceneTextStyle, sceneTextColor, type SceneRichText } from "../../types/slideSceneText";
import { createSceneTextEditor, type SceneTextEditorController, type SceneTextEditorState } from "../../utils/slideSceneTextEditor";
const field = "rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:opacity-40";
function Numeric({ label, value, min, max, onSave }: { label: string; value: number; min: number; max: number; onSave(value: number): void }) {
  const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]);
  const save = () => { const n = Number(draft); if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) { setDraft(String(value)); return; } if (n !== value) onSave(n); };
  return <label className="flex items-center gap-1 text-xs">{label}<input aria-label={label} className={field + " w-20"} type="number" min={min} max={max} step="any" value={draft} onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}/></label>;
}
export function SlideSceneRichTextEditor({ object, backgroundColor = "#FFFFFF", onApply, onCancel }: {
  object: SlideSceneObject; backgroundColor?: string; onApply(value: SceneRichText): boolean; onCancel(): void;
}) {
  const original = useRef(object).current, host = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneTextEditorController | null>(null), callbacks = useRef({ onApply, onCancel });
  callbacks.current = { onApply, onCancel };
  const [error, setError] = useState("");
  const [state, setState] = useState<SceneTextEditorState>({ style: resolvedSceneTextStyle(original), paragraph: {} });
  const apply = () => {
    const value = controller.current?.value();
    if (!value) { setError("The text could not be normalized. Check the size and formatting limits."); return; }
    if (!callbacks.current.onApply(value)) setError("The object changed while this editor was open. Close it and reopen the current version; your draft was not written over newer data.");
  };
  useEffect(() => {
    if (!host.current) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const editor = createSceneTextEditor(host.current, richTextFromObject(original), original, {
      onState: setState, onError: setError, apply, cancel: () => callbacks.current.onCancel(),
    });
    controller.current = editor; editor.focus();
    return () => { controller.current = null; editor.destroy(); if (focused?.isConnected) focused.focus({ preventScroll: true }); };
  }, [original]);
  const fonts = [...new Set([state.style.fontFamily, "Arial", "Calibri", "Aptos", "Georgia", "Times New Roman", "Verdana", "Courier New"])];
  const prevent = (e: React.PointerEvent) => e.preventDefault();
  return createPortal(<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation(); if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") { e.preventDefault(); callbacks.current.onCancel(); }
    if (e.key === "Tab") {
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[contenteditable="true"]') ?? [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><section ref={dialog} role="dialog" aria-modal="true" aria-label="Format slide text" className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-xl">
    <header className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Format slide text</h2><button type="button" className={field} onClick={onCancel} aria-label="Close text editor">Close</button></header>
    <div className="flex flex-wrap items-center gap-2 border-b p-3" role="toolbar" aria-label="Selected text formatting">
      {(["bold", "italic", "underline", "strike"] as const).map(key => <button type="button" key={key} className={field + (state.style[key] ? " ring-2 ring-indigo-500" : "")} aria-label={`Selection ${key}`} aria-pressed={state.style[key]} onPointerDown={prevent} onClick={() => controller.current?.toggle(key)}>{key === "bold" ? "B" : key === "italic" ? "I" : key === "underline" ? "U" : "Strike"}</button>)}
      <label className="text-xs">Font <select aria-label="Selection font" className={field} value={state.style.fontFamily} onChange={e => controller.current?.style({ fontFamily: e.target.value })}>{fonts.map(font => <option key={font}>{font}</option>)}</select></label>
      <Numeric label="Text size (px)" value={state.style.fontSize} min={8} max={180} onSave={fontSize => controller.current?.style({ fontSize })}/>
      <label className="flex items-center gap-1 text-xs">Color<input aria-label="Selection color" type="color" value={sceneTextColor(state.style.color) ?? "#0f172a"} onChange={e => controller.current?.style({ color: e.target.value })}/></label>
      <button type="button" className={field} onPointerDown={prevent} onClick={() => controller.current?.style(resolvedSceneTextStyle(original))}>Reset selection style</button>
      <button type="button" className={field} onPointerDown={prevent} onClick={() => controller.current?.undo()}>Undo text</button><button type="button" className={field} onPointerDown={prevent} onClick={() => controller.current?.redo()}>Redo text</button>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b p-3" role="toolbar" aria-label="Paragraph formatting">
      <label className="text-xs">Align <select aria-label="Paragraph alignment" className={field} value={state.paragraph.align ?? original.align ?? "left"} onChange={e => controller.current?.paragraph({ align: e.target.value as "left" | "center" | "right" })}>{["left", "center", "right"].map(align => <option key={align}>{align}</option>)}</select></label>
      <label className="text-xs">List <select aria-label="Paragraph list" className={field} value={state.paragraph.bullet ?? "none"} onChange={e => controller.current?.paragraph({ bullet: e.target.value as "none" | "bullet" | "number" })}>{["none", "bullet", "number"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <Numeric label="List level" value={state.paragraph.level ?? 0} min={0} max={8} onSave={level => controller.current?.paragraph({ level: Math.round(level) })}/>
      <Numeric label="Line height" value={state.paragraph.lineHeight ?? 1.12} min={0.8} max={3} onSave={lineHeight => controller.current?.paragraph({ lineHeight })}/>
      <Numeric label="Before (px)" value={state.paragraph.spaceBefore ?? 0} min={0} max={300} onSave={spaceBefore => controller.current?.paragraph({ spaceBefore })}/>
      <Numeric label="After (px)" value={state.paragraph.spaceAfter ?? 0} min={0} max={300} onSave={spaceAfter => controller.current?.paragraph({ spaceAfter })}/>
    </div>
    <p className="px-4 py-2 text-xs text-slate-500">Select text to format it. Enter adds a paragraph; Shift+Enter adds a line break. Ctrl/Cmd+Enter applies; Escape cancels. Pasted content is inserted as text.</p>
    <div className="min-h-32 flex-1 overflow-auto bg-slate-100 p-4"><div className="mx-auto min-h-48 bg-white p-6 shadow" style={{ maxWidth: Math.max(320, original.w), fontSize: Math.min(32, original.fontSize ?? 44), fontFamily: original.fontFamily ?? "Arial", color: original.color, backgroundColor }}>
      <style>{'[data-scene-rich-editor]{outline:none;min-height:8rem;white-space:pre-wrap;}[data-scene-rich-editor] p[data-scene-label]::before{content:attr(data-scene-label);position:absolute;left:var(--bullet-left);width:1em;text-align:left;pointer-events:none;}[data-scene-rich-editor] .ProseMirror-selectednode{outline:2px solid #6366f1;}'}</style>
      <div ref={host}/>
    </div></div>
    {error && <p role="alert" className="px-4 py-2 text-sm text-red-700">{error}</p>}
    <footer className="flex items-center justify-end gap-2 border-t p-3"><button type="button" className={field} onClick={onCancel}>Cancel</button><button type="button" className="rounded bg-indigo-600 px-4 py-2 text-sm text-white" onClick={apply}>Apply text formatting</button></footer>
  </section></div>, document.body);
}
