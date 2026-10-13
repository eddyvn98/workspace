"use client";
import type { CameraFrame } from "../types/camera";
export function WorkspaceFrameActions({ frame, index, total, update, duplicate, move, recapture, readOnly }: {
  frame: CameraFrame; index: number; total: number; readOnly: boolean;
  update: (patch: Partial<CameraFrame>) => void; duplicate: () => void; move: (index: number) => void; recapture: () => void;
}) {
  return <details className="text-xs" onKeyDown={(e) => e.stopPropagation()}>
    <summary aria-label={`Settings for ${frame.name}`} className="cursor-pointer">Settings</summary>
    <div className="space-y-2 rounded border p-2">
      <label className="block">Name<input aria-label={`Name for ${frame.name}`} className="w-full rounded border p-1" disabled={readOnly} value={frame.name} onChange={(e) => update({ name: e.target.value })} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={readOnly} onClick={recapture}>Update from selection/view</button>
        <button type="button" disabled={readOnly} onClick={duplicate}>Duplicate frame</button>
        <button type="button" disabled={readOnly || index === 0} aria-label={`Move ${frame.name} up`} onClick={() => move(index - 1)}>↑</button>
        <button type="button" disabled={readOnly || index === total - 1} aria-label={`Move ${frame.name} down`} onClick={() => move(index + 1)}>↓</button>
      </div>
      <label className="block"><input type="checkbox" disabled={readOnly} checked={!!frame.hiddenInPresentation} onChange={(e) => update({ hiddenInPresentation: e.target.checked })} />Skip when presenting</label>
      <label className="block">Presenter notes<textarea aria-label={`Notes for ${frame.name}`} className="w-full rounded border p-1" disabled={readOnly} value={frame.presenterNotes ?? ""} onChange={(e) => update({ presenterNotes: e.target.value })} /></label>
      <span className="text-slate-500">{frame.blockIds?.length ? `${frame.blockIds.length} linked blocks` : "Saved view"}</span>
    </div>
  </details>;
}
