"use client";
import React, { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform } from "../types/block";
import { collectDragBlockIds, DEFAULT_DRAG_TRANSFORM } from "../hooks/blockDragTypes";
import { planSpatialLayout, type SpatialLayoutMode } from "../utils/spatialLayout";
import { commitFrameDrop } from "../hooks/blockDragFrames";
const choices: Array<[SpatialLayoutMode, string]> = [["grid", "Arrange in grid"], ["row", "Arrange in row"], ["column", "Arrange in column"], ["align_left", "Align left"], ["align_center", "Align center"], ["align_right", "Align right"], ["align_top", "Align top"], ["align_middle", "Align middle"], ["align_bottom", "Align bottom"], ["distribute_horizontal", "Distribute horizontally"], ["distribute_vertical", "Distribute vertically"]];
export function WorkspaceSpatialControls() {
  const selected = useWorkspaceStore((s) => s.selectedBlockIds), blocks = useWorkspaceStore((s) => s.blocks), readOnly = useWorkspaceStore((s) => s.isReadOnly);
  const [open, setOpen] = useState(false), [error, setError] = useState("");
  if (selected.length < 2 || readOnly) return null;
  const run = (mode: SpatialLayoutMode) => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly || state.selectedBlockIds.some((id) => state.blocks[id]?.style?.isLocked)) { setError("Unlock selected positions first."); return; }
    const roots = state.selectedBlockIds.filter((id) => !state.selectedBlockIds.some((other) => other !== id && collectDragBlockIds(state.blocks, other, [other]).includes(id)));
    const rects = roots.map((id) => ({ id, ...resolveTransform(state.blocks[id].transform, DEFAULT_DRAG_TRANSFORM) }));
    const plan = planSpatialLayout(rects, mode);
    if (!plan) { setError(mode.startsWith("distribute") ? "Select at least three independent blocks." : "Select at least two independent blocks."); return; }
    const moved = new Set<string>(), next = { ...state.blocks }, now = Date.now();
    for (const rect of rects) {
      const target = plan.get(rect.id)!;
      for (const id of collectDragBlockIds(state.blocks, rect.id, [rect.id])) {
        if (moved.has(id)) continue;
        const block = state.blocks[id], position = resolveTransform(block.transform, DEFAULT_DRAG_TRANSFORM);
        next[id] = { ...block, transform: { ...block.transform, override: { ...position, x: position.x + target.x - rect.x, y: position.y + target.y - rect.y } }, updatedAt: now };
        moved.add(id);
      }
    }
    const connectors = Object.fromEntries(Object.entries(state.connectors).map(([id, c]) => [id, moved.has(c.fromBlockId) || moved.has(c.toBlockId) ? { ...c, waypoints: undefined } : c]));
    useWorkspaceStore.setState({ blocks: next, connectors }); commitFrameDrop([...moved]); setError(""); setOpen(false);
  };
  return <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
    <button type="button" aria-label="Arrange selected blocks" aria-expanded={open} title="Align and distribute selection" onClick={() => setOpen(!open)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"><LayoutGrid className="h-4 w-4" /></button>
    {open && <div role="menu" aria-label="Arrange selection" className="absolute left-full top-0 z-50 ml-2 w-52 rounded-xl border bg-white p-2 shadow-xl dark:bg-slate-900">
      {choices.map(([mode, label]) => <button key={mode} role="menuitem" type="button" disabled={selected.some((id) => blocks[id]?.style?.isLocked)} onClick={() => run(mode)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100 disabled:opacity-40">{label}</button>)}
      {selected.some((id) => blocks[id]?.style?.isLocked) && <p className="px-2 text-xs text-amber-700">Unlock selected positions first.</p>}
      {error && <p role="alert" className="px-2 text-xs text-red-700">{error}</p>}
    </div>}
  </div>;
}
