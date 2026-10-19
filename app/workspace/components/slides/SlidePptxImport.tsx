"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideDeckPayload, SlideMeta } from "../../types/slide";
import type { PptxImportResult } from "@/lib/workspace/pptx-import/model";
import { uploadOrReadWorkspaceImage } from "../../utils/imageUpload";

type Props = {
  data: SlideDeckPayload;
  readOnly: boolean;
  onAppend: (slides: SlideMeta[], expected: string, ratio: "16:9" | "4:3") => void;
};
/** A staged import: reading is inert; only the explicit confirmation uploads images and appends slides. */
export function SlidePptxImport({ data, readOnly, onAppend }: Props) {
  const input = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const session = useRef<AbortController | null>(null);
  const latest = useRef({ data, readOnly, onAppend }); latest.current = { data, readOnly, onAppend };
  const expected = useRef("");
  const [stage, setStage] = useState<"idle" | "reading" | "review" | "uploading">("idle");
  const [result, setResult] = useState<PptxImportResult | null>(null);
  const [error, setError] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => { session.current?.abort(); }, []);
  useEffect(() => { if (stage !== "idle" && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [stage]);
  const close = () => { session.current?.abort(); session.current = null; setStage("idle"); setResult(null); setError(""); };
  const choose = async (file?: File) => {
    if (!file || latest.current.readOnly) return;
    session.current?.abort(); const controller = new AbortController(); session.current = controller;
    expected.current = JSON.stringify(latest.current.data);
    setResult(null); setError(""); setAcknowledged(false); setMessage(""); setStage("reading");
    try {
      if (file.size > 25_000_000) throw new Error("Choose a PPTX smaller than 25 MB");
      const { parsePptx } = await import("@/lib/workspace/pptx-import");
      const parsed = await parsePptx(new Uint8Array(await file.arrayBuffer()), file.name, { aspectRatio: latest.current.data.aspectRatio || "16:9", signal: controller.signal });
      controller.signal.throwIfAborted();
      if (session.current !== controller) return;
      setResult(parsed); setStage("review");
    } catch (reason) {
      if (controller.signal.aborted || session.current !== controller) return;
      setError(reason instanceof Error ? reason.message : "Unable to read PPTX"); setStage("review");
    }
  };
  const confirm = async () => {
    const controller = session.current;
    if (!controller || !result || latest.current.readOnly || stage !== "review" || (result.notices.length && !acknowledged)) return;
    setError("");
    try {
      if (JSON.stringify(latest.current.data) !== expected.current) throw new Error("The deck changed. Close and reopen the PPTX to avoid overwriting edits.");
      if (latest.current.data.slideOrder.length + result.slides.length > 60) throw new Error("The resulting deck cannot exceed 60 slides");
      setStage("uploading");
      const { materializePptxImport } = await import("@/lib/workspace/pptx-import/apply");
      const slides = await materializePptxImport(result, asset => uploadOrReadWorkspaceImage(new File([new Uint8Array(asset.bytes).buffer], asset.name, { type: asset.mime })), controller.signal);
      controller.signal.throwIfAborted();
      if (session.current !== controller) return;
      if (latest.current.readOnly) throw new Error("Editing permission changed. Nothing was inserted.");
      latest.current.onAppend(slides, expected.current, result.aspectRatio);
      setMessage(`Added ${slides.length} editable slides. Workspace autosave will save the changes.`);
      close();
    } catch (reason) {
      if (controller.signal.aborted || session.current !== controller) return;
      setError(reason instanceof Error ? reason.message : "PPTX import failed"); setStage("review");
    }
  };
  return <>
    <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-50" aria-label="Import PowerPoint" disabled={readOnly || stage !== "idle"} onClick={() => input.current?.click()}>Import PPTX</button>
    <input ref={input} hidden type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void choose(file); }} />
    {message && <span className="sr-only" role="status">{message}</span>}
    {stage !== "idle" && typeof document !== "undefined" && createPortal(
      <dialog ref={dialog} aria-labelledby="pptx-import-heading" className="w-[min(42rem,95vw)] max-h-[90vh] overflow-auto rounded-xl border bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-black/50"
        onCancel={e => { e.preventDefault(); close(); }} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <h2 id="pptx-import-heading" className="text-lg font-semibold">Import PowerPoint</h2>
        <p className="mt-2 text-sm">Imported slides are appended. Existing slides and the original PPTX are not replaced.</p>
        {(stage === "reading" || stage === "uploading") && <p className="my-5" role="status">{stage === "reading" ? "Reading presentation and checking compatibility..." : "Uploading embedded images to Workspace..."}</p>}
        {error && <p role="alert" className="my-3 rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</p>}
        {result && <>
          <p className="my-3 text-sm font-medium">{result.title}: {result.slides.length} slides, {result.assets.length} embedded images, {result.aspectRatio}</p>
          <div className="max-h-48 overflow-auto rounded border p-3 text-sm" aria-label="PPTX compatibility report">
            {result.notices.length ? <><p className="mb-2 font-semibold">Review these differences before importing:</p>{result.notices.map((n,i) => <p className="mb-2" key={i}>{n.slide ? `Slide ${n.slide}: ` : ""}{n.message}</p>)}</> : <p>No unsupported features were detected by the basic importer. Visual review is still recommended.</p>}
          </div>
          <p className="mt-3 text-xs text-slate-600">Text uses a single style per box. Tables become text/shape cells. Unsupported graphics, animation and custom formatting are listed above; this is not a lossless PowerPoint conversion.</p>
          {!!result.notices.length && <label className="my-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} disabled={stage === "uploading"} />I reviewed the compatibility report and accept these differences.</label>}
        </>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus className="rounded border px-3 py-2 text-sm" onClick={close}>Cancel</button>
          <button type="button" className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={readOnly || !result || stage !== "review" || (!!result.notices.length && !acknowledged)} onClick={() => void confirm()}>Append slides</button>
        </div>
      </dialog>, document.body)}
  </>;
}
