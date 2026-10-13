"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { getBlockHistory, type WorkspaceBlockEditEvent } from "../hooks/workspaceVersionApi";
import type { CanvasBlock } from "../types/block";
import { colorForEmail } from "../utils/presenceColor";

function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || email;
}

function actionLabel(opType: string): string {
  switch (opType) {
    case "map.update": return "edited this map";
    case "node.add": return "added this node";
    case "node.delete": return "deleted this node";
    case "node.restore": return "restored this node";
    default: return "edited this node";
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return date.toLocaleString();
}

function versionTitle(event: WorkspaceBlockEditEvent): string | null {
  const version = event.nodeVersion;
  if (!version) return null;
  const data = version.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const markdown = (data as { markdown?: unknown }).markdown;
    if (typeof markdown === "string" && markdown.trim()) return markdown;
  }
  return typeof version.description === "string" && version.description.trim()
    ? version.description
    : null;
}

function blockVersionFromEvent(event: WorkspaceBlockEditEvent, blockId: string): CanvasBlock | null {
  const version = event.nodeVersion;
  if (!version || typeof version !== "object" || Array.isArray(version)) return null;
  if (!version.data || typeof version.data !== "object" || Array.isArray(version.data)) return null;
  if (!version.transform || typeof version.transform !== "object" || Array.isArray(version.transform)) return null;
  if (typeof version.type !== "string") return null;
  return { ...version, id: blockId } as CanvasBlock;
}

export function WorkspaceBlockHistoryPopover({
  boardId,
  blockId,
  onClose,
  onPreviewVersion,
}: {
  boardId: string;
  blockId: string;
  onClose: () => void;
  onPreviewVersion?: (version: CanvasBlock) => void;
}) {
  const [events, setEvents] = useState<WorkspaceBlockEditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    const result = await getBlockHistory(boardId, blockId, before);
    if (!mountedRef.current) return;
    setFailed(!before && result.events.length === 0);
    setEvents((current) => before ? [...current, ...result.events] : result.events);
    setCursor(result.nextCursor);
    setLoading(false);
  }, [boardId, blockId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto absolute left-5 top-0 z-[40] w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      data-workspace-block-history={blockId}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <History className="h-3.5 w-3.5" /> Edit history
        </span>
        <button type="button" onClick={onClose} aria-label="Close history" title="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
        {loading && <p className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>}
        {!loading && events.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-400">{failed ? "Could not load this node's history." : "No recorded changes for this node yet."}</p>}
        {!loading && events.map((event) => (
          <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForEmail(event.actorEmail) }} /><span className="truncate">{displayName(event.actorEmail)}</span></span>
              <span className="shrink-0 text-[10px] text-slate-400">{formatTime(event.latestAt)}</span>
            </div>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">{actionLabel(event.opType)}</p>
            {versionTitle(event) && <p className="mt-1 truncate text-slate-600 dark:text-slate-300">{versionTitle(event)}</p>}
            {blockVersionFromEvent(event, blockId) && (
              <button
                type="button"
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-left hover:border-orange-300 hover:bg-orange-50/60 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-orange-700 dark:hover:bg-orange-950/20"
                data-workspace-block-history-preview
                onClick={() => {
                  const version = blockVersionFromEvent(event, blockId);
                  if (version) onPreviewVersion?.(version);
                }}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Version after edit</div>
                <div className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">View in canvas</div>
              </button>
            )}
          </div>
        ))}
      </div>
      {cursor && !loading && <button type="button" onClick={() => void load(cursor)} className="mt-1.5 w-full rounded-lg py-1 text-[10px] font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/20">Load older</button>}
    </div>
  );
}
