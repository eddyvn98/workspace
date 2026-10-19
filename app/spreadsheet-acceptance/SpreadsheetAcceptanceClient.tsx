"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createOfficeBlock } from "@/lib/office/factory";
import { flushWorkspaceEditors } from "@/app/workspace/utils/workspaceEditorFlush";
import type { CanvasBlock } from "@/app/workspace/types/block";
const Spreadsheet = dynamic(() => import("@/app/workspace/components/table/WorkspaceSpreadsheetEditor"), { ssr: false });
const key = "spreadsheet-acceptance-v1";
export default function SpreadsheetAcceptanceClient() {
  const [block, setBlock] = useState<CanvasBlock<"table"> | null>(null), [readOnly, setReadOnly] = useState(false);
  const [saved, setSaved] = useState(""), [dirty, setDirty] = useState(false);
  const latest = useRef(block); latest.current = block;
  useEffect(() => {
    const raw = localStorage.getItem(key);
    setBlock(raw ? JSON.parse(raw) : createOfficeBlock("spreadsheet", "Acceptance") as CanvasBlock<"table">);
    setReadOnly(new URLSearchParams(location.search).get("readonly") === "1");
  }, []);
  useEffect(() => { if (block) localStorage.setItem(key, JSON.stringify(block)); }, [block]);
  if (!block) return <p>Loading spreadsheet fixture...</p>;
  return <main className="flex h-dvh flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-3 p-2">
      <span>Spreadsheet isolated browser fixture</span>
      <button onClick={async () => { if (await flushWorkspaceEditors("fixture")) setSaved(JSON.stringify(latest.current?.data)); }}>Flush spreadsheet</button>
      <button disabled={readOnly} onClick={() => setBlock((current) => current ? { ...current, data: { ...current.data, cellNotes: { "0_0": { value: "Remote note" } } } } : current)}>Simulate remote note</button>
      <span data-testid="draft-status">{dirty ? "Editing cell" : "No active draft"}</span>
    </div>
    <output data-testid="saved-data" hidden>{saved}</output>
    <output data-testid="current-data" hidden>{JSON.stringify(block.data)}</output>
    <div className="min-h-0 flex-1"><Spreadsheet block={block} boardId="fixture" standalone fillParent hideHeader
      onDirtyChange={setDirty} allowEdit={!readOnly} boardTitle="Acceptance" onClose={() => {}}
      onChange={(patch) => { if (!readOnly) setBlock((current) => current ? { ...current, data: { ...current.data, ...patch } } : current); }} /></div>
  </main>;
}
