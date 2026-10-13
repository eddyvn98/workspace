"use client";
import { useState } from "react";
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";
import { buildSlideDataHtml } from "@/app/api/workspaces/[id]/agent/slideDataLayouts";
import { parseSlideChart } from "../../utils/slideChart";

export function SlideChartNodeView({ node, editor, updateAttributes }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: ({ editor: instance }) => instance.isEditable });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const series = parseSlideChart(node.attrs.series);
  const start = () => {
    if (!editor.isEditable) return;
    setDraft(series.map((item) => `${item.label}\t${item.value}`).join("\n"));
    setError(""); setEditing(true);
  };
  const save = () => {
    if (!editor.isEditable) return;
    const parsed = parseSlideChart(draft.trim().split(/\r?\n/).map((line) => {
      const [label, value] = line.split("\t");
      return { label, value: value?.trim() ? Number(value) : NaN };
    }));
    if (!parsed.length || parsed.some((item) => !item.label.trim())) { setError("Use 1–8 labels and non-negative numbers, separated by tabs."); return; }
    updateAttributes({ series: parsed }); setEditing(false);
  };
  return <NodeViewWrapper contentEditable={false} onDoubleClick={start}>
    <div dangerouslySetInnerHTML={{ __html: buildSlideDataHtml("bar-chart", undefined, { series }) }} />
    {editable && <button type="button" onClick={start} className="rounded border px-2 py-1 text-xs">Edit chart data</button>}
    {editing && editable && <div className="space-y-2 rounded border bg-white p-2 text-sm text-slate-800" onPointerDown={(e) => e.stopPropagation()}>
      <textarea aria-label="Chart values" className="h-24 w-full rounded border p-2" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" onClick={save}>Save chart</button> <button type="button" onClick={() => setEditing(false)}>Cancel</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </NodeViewWrapper>;
}
