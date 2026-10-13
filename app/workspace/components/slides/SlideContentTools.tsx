"use client";
import { useRef, useState } from "react";
import type { SlideDeckPayload } from "../../types/slide";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { buildSlideLayoutHtml } from "@/app/api/workspaces/[id]/agent/slideLayouts";
import { slideDataProblem } from "@/app/api/workspaces/[id]/agent/slideDataLayouts";
import { uploadWorkspaceImageWithOriginal } from "../../utils/imageUpload";

export function SlideContentTools({ blockId, slideId, onEdit }: { blockId: string; slideId: string; onEdit: () => void }) {
  const readOnly = useWorkspaceStore((state) => state.isReadOnly);
  const [kind, setKind] = useState<"data-table" | "bar-chart" | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const append = (html: string) => {
    const store = useWorkspaceStore.getState();
    const block = store.blocks[blockId];
    if (!block || block.type !== "slideDeck") return;
    const data = block.data as SlideDeckPayload;
    const slide = data.slides[slideId];
    if (!slide) return;
    store.updateBlock(blockId, { data: { ...data, slides: { ...data.slides, [slideId]: { ...slide, html: slide.html + html } } } });
  };
  const insert = () => {
    if (!kind) return;
    const lines = draft.trim().split(/\r?\n/).map((line) => line.split("\t"));
    const params = kind === "data-table" ? { columns: lines[0], rows: lines.slice(1) }
      : { series: lines.map(([label, value]) => ({ label, value: value?.trim() ? Number(value) : NaN })) };
    const problem = slideDataProblem(kind, params);
    if (problem) { setError(problem); return; }
    append(buildSlideLayoutHtml(kind, params));
    setKind(null);
  };
  const image = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const uploaded = await uploadWorkspaceImageWithOriginal(file);
      if (!uploaded) throw new Error("Image upload failed. Please try again.");
      append(buildSlideLayoutHtml("image-caption", { imageUrl: uploaded.url, caption: file.name }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed."); }
    finally { setBusy(false); }
  };
  return <div className="relative border-b bg-white px-2 py-1 text-xs text-slate-700" onPointerDown={(e) => e.stopPropagation()}>
    <div className="flex gap-3">
      <button type="button" disabled={readOnly} onClick={onEdit}>Edit content</button>
      <button type="button" disabled={readOnly} onClick={() => { setKind("data-table"); setDraft(""); setError(""); }}>Insert data table</button>
      <button type="button" disabled={readOnly} onClick={() => { setKind("bar-chart"); setDraft(""); setError(""); }}>Insert chart</button>
      <button type="button" disabled={busy || readOnly} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Insert image"}</button>
    </div>
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void image(file); }} />
    {kind && <div className="absolute left-0 top-full z-50 w-80 space-y-2 rounded border bg-white p-3 shadow-lg" role="dialog" aria-label={kind === "data-table" ? "Insert data table" : "Insert chart"}>
      <label className="block">{kind === "data-table" ? "Paste cells from a spreadsheet (first row contains headings)" : "Paste labels and values from two spreadsheet columns"}
        <textarea aria-label="Slide data" className="mt-2 h-28 w-full rounded border p-2" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button type="button" disabled={readOnly} onClick={insert}>Insert</button> <button type="button" disabled={readOnly} onClick={() => { setKind(null); setError(""); }}>Cancel</button>
      {error && <p role="alert">{error}</p>}
    </div>}
    {!kind && error && <p role="alert">{error}</p>}
  </div>;
}
