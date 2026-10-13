"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { WorkspaceSnapshotPreview } from "./WorkspaceSnapshotPreview";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";
import {
  getSnapshot,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  type WorkspaceSnapshotDetail,
  type WorkspaceSnapshotSummary,
} from "../hooks/workspaceVersionApi";

export interface WorkspaceVersionHistoryPanelProps {
  boardId: string;
  onClose: () => void;
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
}

function displayCreatedBy(createdBy: string): string {
  if (createdBy === "user@example.com") return "User";
  return createdBy.split("@")[0] || createdBy;
}

export function WorkspaceVersionHistoryPanel({ boardId, onClose }: WorkspaceVersionHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshotSummary[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<WorkspaceSnapshotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const previewRequestRef = useRef(0);

  const loadVersions = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      setSnapshots(await listSnapshots(boardId));
    } catch {
      toast.error("Failed to load version history");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    previewRequestRef.current += 1;
    setPreviewId(null);
    setPreviewDetail(null);
    void loadVersions();
  }, [loadVersions]);

  const handlePreview = useCallback(async (snapshotId: string) => {
    const requestId = ++previewRequestRef.current;
    if (previewId === snapshotId) {
      setPreviewId(null);
      setPreviewDetail(null);
      return;
    }
    setPreviewId(snapshotId);
    setPreviewDetail(null);
    setPreviewLoading(true);
    try {
      const detail = await getSnapshot(boardId, snapshotId);
      if (!detail) throw new Error("Failed to load snapshot preview");
      if (requestId !== previewRequestRef.current) return;
      setPreviewDetail(detail);
    } catch (error) {
      if (requestId !== previewRequestRef.current) return;
      toast.error(error instanceof Error ? error.message : "Failed to load snapshot preview");
      setPreviewId(null);
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }, [boardId, previewId]);

  const handleSaveVersion = useCallback(async () => {
    if (!boardId || saving) return;
    const label = window.prompt("Version label (optional):");
    if (label === null) return;
    setSaving(true);
    try {
      const created = await saveSnapshot(boardId, label.trim() || undefined);
      if (!created) throw new Error("Failed to save version");
      toast.success("Version saved");
      await loadVersions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save version");
    } finally {
      setSaving(false);
    }
  }, [boardId, loadVersions, saving]);

  const handleRestore = useCallback(async (snapshot: WorkspaceSnapshotSummary) => {
    if (!boardId || restoringId) return;
    const label = snapshot.label || formatTimestamp(snapshot.createdAt);
    if (!window.confirm(`Restore "${label}"? Current unsaved canvas changes will be overwritten.`)) return;
    setRestoringId(snapshot.id);
    try {
      const restored = await restoreSnapshot(boardId, snapshot.id);
      if (!restored) throw new Error("Failed to restore version");
      useWorkspaceStore.setState({
        blocks: restored.blocks as ReturnType<typeof useWorkspaceStore.getState>["blocks"],
        blockOrder: restored.blockOrder,
        connectors: restored.connectors as ReturnType<typeof useWorkspaceStore.getState>["connectors"],
        selectedBlockIds: [],
        selectedConnectorId: null,
      });
      toast.success("Version restored");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore version");
    } finally {
      setRestoringId(null);
    }
  }, [boardId, onClose, restoringId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div {...workspaceKeyboardScope("version-history")} className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2"><History className="h-5 w-5 text-orange-500" /><span className="text-sm font-bold">Version history</span></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleSaveVersion} disabled={saving || loading} className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save version
            </button>
            <button type="button" onClick={onClose} aria-label="Close version history" title="Close version history" className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-5">
          <div className="w-64 shrink-0 space-y-2 overflow-y-auto">
            {loading && snapshots.length === 0 && <div className="flex justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {!loading && snapshots.length === 0 && <div className="py-8 text-center text-xs text-slate-400">No versions saved yet. Snapshots are also created automatically as you edit.</div>}
            {snapshots.map((snapshot) => {
              const active = previewId === snapshot.id;
              return <button key={snapshot.id} type="button" aria-pressed={active} onClick={() => void handlePreview(snapshot.id)} className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${active ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-slate-100 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700"}`}>
                <div className="mb-1 flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${snapshot.createdBy === "user@example.com" ? "bg-violet-500" : "bg-slate-400"}`} /><span className="truncate text-xs font-semibold">{displayCreatedBy(snapshot.createdBy)}</span></div>
                <div className="text-[10px] text-slate-400">{formatTimestamp(snapshot.createdAt)}</div>
                {snapshot.label && <div className="mt-1 inline-block max-w-full truncate rounded bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-700">{snapshot.label}</div>}
              </button>;
            })}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto border-l border-slate-100 pl-4 dark:border-slate-800">
            {!previewId && <div className="py-8 text-center text-xs text-slate-400">Select a version on the left to preview it read-only.</div>}
            {previewId && previewLoading && <div className="flex justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {previewId && previewDetail && !previewLoading && <div><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Preview (read-only)</span><button type="button" onClick={() => void handleRestore(previewDetail)} disabled={restoringId === previewDetail.id} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900"><RotateCcw className="h-3 w-3" /> Restore this version</button></div><div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30"><WorkspaceSnapshotPreview blocks={previewDetail.blocks} blockOrder={previewDetail.blockOrder} /></div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceVersionHistoryPanel;
