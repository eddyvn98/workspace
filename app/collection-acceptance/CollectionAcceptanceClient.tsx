"use client";

import React, { useEffect, useRef, useState } from "react";
import { WorkspaceInsertPanel } from "@/app/workspace/components/WorkspaceInsertPanel";
import { WorkspaceTableSelectionToolbar } from "@/app/workspace/components/WorkspaceTableSelectionToolbar";
import { CollectionBlock } from "@/app/workspace/renderers/CollectionBlock";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { createDualTransform, type CanvasBlock } from "@/app/workspace/types/block";

const STORAGE_KEY = "collection-acceptance-board-v1";
const SOURCE_TABLE: CanvasBlock<"table"> = {
  id: "source-table", type: "table", createdAt: 1, updatedAt: 1,
  transform: createDualTransform({ x: 10, y: 10, w: 400, h: 200, rotation: 0, zIndex: 0 }),
  data: {
    rows: 3, cols: 2, headerRow: true,
    cells: [["Name", "Status"], ["Original row", "todo"], ["Other row", "done"]],
    columnTypes: ["text", "select"],
    columnSelectOptions: { 1: [{ id: "todo", label: "To do", color: "blue" }, { id: "done", label: "Done", color: "green" }] },
  },
};

export default function CollectionAcceptanceClient() {
  const blocks = useWorkspaceStore((s) => s.blocks);
  const selected = useWorkspaceStore((s) => s.selectedBlockIds[0]);
  const isReadOnly = useWorkspaceStore((s) => s.isReadOnly);
  const updateBlock = useWorkspaceStore((s) => s.updateBlock);
  const [ready, setReady] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let parsed: Record<string, CanvasBlock> = {};
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      parsed = saved ? JSON.parse(saved) as Record<string, CanvasBlock> : {};
    } catch { parsed = {}; }
    const loaded = { [SOURCE_TABLE.id]: SOURCE_TABLE, ...parsed };
    useWorkspaceStore.setState({
      boardId: "collection-acceptance", blocks: loaded, blockOrder: Object.keys(loaded),
      selectedBlockIds: [], isReadOnly: false,
    });
    setReady(true);
    const unsubscribe = useWorkspaceStore.subscribe((next, prev) => {
      if (next.blocks === prev.blocks) return;
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.blocks)); } catch {}
    });
    return unsubscribe;
  }, []);
  const chosen = selected && blocks[selected]?.type === "collection" ? blocks[selected] :
    Object.values(blocks).find((b) => b.type === "collection");
  const collection = chosen?.type === "collection" ? chosen as CanvasBlock<"collection"> : null;
  if (!ready) return <main>Preparing browser test…</main>;
  return <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-3 p-3 sm:p-6" data-testid="collection-acceptance">
    <header className="flex flex-wrap items-center gap-3">
      <h1 className="text-lg font-semibold">Collection browser acceptance fixture</h1>
      <WorkspaceInsertPanel />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={isReadOnly} onChange={(e) => useWorkspaceStore.getState().setIsReadOnly(e.target.checked)} />
        Read-only
      </label>
      <button className="rounded border px-3 py-1 text-sm" onClick={() => setShowTable((v) => !v)}>Table conversion controls</button>
    </header>
    {showTable && <div className="relative h-16">
      <WorkspaceTableSelectionToolbar block={blocks[SOURCE_TABLE.id] as CanvasBlock<"table">}
        toolbarRef={toolbarRef} style={{ left: 0, top: 0 }} position="absolute" onCellCommand={() => {}} />
    </div>}
    <div data-testid="table-source" className="text-xs">Source remains: {(blocks[SOURCE_TABLE.id] as CanvasBlock<"table">).data.cells[1][0]}</div>
    {collection ? <div className="h-[220px] w-[380px] max-w-full min-w-0 overflow-hidden rounded-lg border" data-testid="collection-host">
      <CollectionBlock key={collection.id} block={collection} isSelected readOnly={isReadOnly} onChange={(data) =>
        updateBlock(collection.id, { data: { ...collection.data, ...data } })} />
    </div> : <p>No collection. Use Insert / Add Collection or convert the source table.</p>}
  </main>;
}
