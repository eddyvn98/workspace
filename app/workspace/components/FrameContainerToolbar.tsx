"use client";
import { useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { addContainerMembers, fitContainerToContents, frameMembers } from "../utils/frameMembership";

export function FrameContainerToolbar({ frameId }: { frameId: string }) {
  const block = useWorkspaceStore((s) => s.blocks[frameId]);
  const readOnly = useWorkspaceStore((s) => s.isReadOnly);
  const selected = useWorkspaceStore((s) => s.selectedBlockIds);
  const zoom = useWorkspaceStore((s) => s.camera.zoom);
  const [error, setError] = useState("");
  const members = frameMembers(block);
  if (!block || !members || readOnly || block.style?.isLocked) return null;
  const data = block.data as unknown as { frameAutoMembership?: boolean; label?: string };
  const updateMembers = (ids: string[]) => {
    const state = useWorkspaceStore.getState(), current = state.blocks[frameId];
    if (!current || state.isReadOnly || current.style?.isLocked) return;
    state.updateBlock(frameId, { data: { ...current.data, frameBlockIds: ids } } as never);
  };
  const fit = () => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) return;
    const patch = fitContainerToContents(state.blocks, frameId);
    if (!patch) { setError("Add contents first. Rotate the frame to 0° before fitting."); return; }
    state.updateBlockTransform(frameId, patch, "override"); setError("");
  };
  const add = () => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) return;
    const ids = state.selectedBlockIds.filter((id) => id !== frameId);
    const next = addContainerMembers(state.blocks, frameId, ids);
    if (!next) { setError("Unlock selected positions. A frame cannot contain itself or its ancestor."); return; }
    updateMembers(next); setError("");
  };
  return <div role="toolbar" aria-label="Frame actions" data-frame-container-toolbar="true" className="absolute right-0 z-40 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 text-xs text-slate-700 shadow-lg [&_button]:min-h-7 [&_button]:rounded [&_button]:px-2 [&_button:hover]:bg-slate-100 [&_button:disabled]:opacity-40" style={{ top: `calc(100% + ${12 / Math.max(0.01, zoom)}px)`, width: 360, transform: `scale(${1 / Math.max(0.01, zoom)})`, transformOrigin: "top right" }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <span>{members.length} contents</span>
    <button type="button" aria-label="Fit frame to contents" onClick={fit}>Fit contents</button>
    <button type="button" aria-label="Add selected blocks to frame" disabled={selected.length < 2} onClick={add}>Add selection</button>
    <button type="button" aria-label="Release frame contents" disabled={!members.length} onClick={() => updateMembers([])}>Release contents</button>
    <label className="flex min-h-7 items-center gap-2"><input className="h-4 w-4" type="checkbox" aria-label="Automatically capture dropped blocks" checked={data.frameAutoMembership !== false} onChange={(e) => {
      const state = useWorkspaceStore.getState(), current = state.blocks[frameId];
      if (state.isReadOnly || current?.style?.isLocked) return;
      state.updateBlock(frameId, { data: { ...current.data, frameAutoMembership: e.target.checked } } as never);
    }} /> Capture drops</label>
    {error && <span role="alert" className="w-full text-red-700">{error}</span>}
  </div>;
}
