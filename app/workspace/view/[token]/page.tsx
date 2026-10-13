"use client";

/**
 * app/workspace/view/[token]/page.tsx
 *
 * Anonymous, no-login read-only workspace board viewer. Reachable by anyone
 * holding a valid public share link. See app/api/workspaces/public/[token]/route.ts
 * for the unauthenticated data source.
 *
 * Renders the canvas in full read-only mode without editing chrome or persistence.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Ban, Eye } from "lucide-react";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { WorkspaceCanvas } from "@/app/workspace/components/WorkspaceCanvas";
import { BlockFrame } from "@/app/workspace/components/BlockFrame";
import { WorkspaceViewportBar } from "@/app/workspace/components/WorkspaceViewportBar";
import { useWorkspaceViewportControls } from "@/app/workspace/hooks/useWorkspaceViewportControls";
import { DEFAULT_CAMERA } from "@/app/workspace/types/camera";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { CanvasConnector } from "@/app/workspace/types/connector";
import { attachmentTransform, collectAttachedBlockIds, findTableAttachment } from "@/app/workspace/utils/tableAttachments";
import { normalizeTreeLayoutFields } from "@/app/workspace/utils/normalizeTreeLayoutFields";

interface PublicBoardPayload {
  id: string;
  title: string;
  blocks: Record<string, CanvasBlock>;
  blockOrder: string[];
  connectors: Record<string, CanvasConnector>;
  camera?: typeof DEFAULT_CAMERA;
  treeLayoutDirection?: unknown;
  treeGrowthMode?: unknown;
  treeLayoutFamily?: unknown;
  treeTimelineBranchMode?: unknown;
  treeTimelineDescendantStyle?: unknown;
  treeCatalogDescendantStyle?: unknown;
}

export default function PublicWorkspaceViewPage({ params }: { params: { token: string } }) {
  const [status, setStatus] = useState<"loading" | "ok" | "not_found">("loading");
  const [boardTitle, setBoardTitle] = useState<string>("Untitled Board");
  const fittedTokenRef = useRef<string | null>(null);

  const blocks = useWorkspaceStore((state) => state.blocks);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const attachedBlockIds = useMemo(() => collectAttachedBlockIds(blocks), [blocks]);
  const parentIdsWithChildren = useMemo(() => {
    const set = new Set<string>();
    for (const b of Object.values(blocks)) {
      if (b.parentId) set.add(b.parentId);
    }
    return set;
  }, [blocks]);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setSelectedConnectorId = useWorkspaceStore((state) => state.setSelectedConnectorId);
  const { zoomAtCenter, handleFitView } = useWorkspaceViewportControls();

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/workspaces/public/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data = (await res.json()) as PublicBoardPayload;
        if (cancelled) return;

        const title = data.title || "Untitled Board";
        setBoardTitle(title);

        useWorkspaceStore.setState({
          blocks: data.blocks ?? {},
          blockOrder: data.blockOrder ?? [],
          connectors: data.connectors ?? {},
          camera: data.camera ?? DEFAULT_CAMERA,
          title,
          ...normalizeTreeLayoutFields(data),
          isReadOnly: true,
          boardId: `public-view-${params.token}`,
          selectedBlockIds: [],
          selectedConnectorId: null,
        });

        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("not_found");
      });

    return () => {
      cancelled = true;
      // Reset store read-only state on cleanup
      useWorkspaceStore.setState({
        isReadOnly: false,
        selectedBlockIds: [],
        selectedConnectorId: null,
      });
    };
  }, [params.token]);

  const handleBackgroundPointerDown = useCallback(() => {
    setSelection([]);
    setSelectedConnectorId(null);
  }, [setSelection, setSelectedConnectorId]);

  useEffect(() => {
    if (status !== "ok") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "+" || event.key === "=" || (event.ctrlKey && event.key === "=")) {
        event.preventDefault();
        zoomAtCenter(1.2);
      } else if (event.key === "-" || event.key === "_" || (event.ctrlKey && event.key === "-")) {
        event.preventDefault();
        zoomAtCenter(1 / 1.2);
      } else if (event.key === "0" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleFitView();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFitView, status, zoomAtCenter]);

  useEffect(() => {
    if (status !== "ok" || blockOrder.length === 0 || fittedTokenRef.current === params.token) return;
    fittedTokenRef.current = params.token;
    const timer = window.setTimeout(handleFitView, 200);
    return () => window.clearTimeout(timer);
  }, [blockOrder.length, handleFitView, params.token, status]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center w-full h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Loading workspace…
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 gap-3 text-center px-4">
        <Ban className="w-8 h-8 text-rose-500" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          This share link is invalid or has expired.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 select-none">
      {/* Read-only top navigation bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="truncate max-w-[280px] sm:max-w-md font-semibold text-slate-800 dark:text-slate-100">
            {boardTitle}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-full px-2 py-0.5 flex-shrink-0">
            <Eye className="w-3 h-3" />
            View only
          </span>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 relative w-full h-full min-h-0 overflow-hidden">
        <WorkspaceCanvas onBackgroundPointerDown={handleBackgroundPointerDown}>
          {blockOrder.map((id) => {
            const block = blocks[id];
            if (!block || attachedBlockIds.has(block.id)) return null;
            return <BlockFrame key={block.id} block={block} hasChildren={parentIdsWithChildren.has(block.id)} />;
          })}
          {blockOrder.map((id) => {
            const block = blocks[id];
            if (!block || !attachedBlockIds.has(block.id)) return null;
            const attachment = findTableAttachment(blocks, block.id);
            const transformOverride = attachment
              ? attachmentTransform(attachment.table, attachment.attachment, attachment.row, attachment.col)
              : null;
            if (!transformOverride) return null;
            return <BlockFrame key={`attached-${block.id}`} block={block} transformOverride={transformOverride} isTableAttachment hasChildren={parentIdsWithChildren.has(block.id)} />;
          })}
        </WorkspaceCanvas>
          <WorkspaceViewportBar showModeToggle={false} />
      </div>
    </div>
  );
}
