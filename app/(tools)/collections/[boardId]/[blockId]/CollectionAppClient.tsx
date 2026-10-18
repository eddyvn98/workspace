"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { useWorkspacePersistence } from "@/app/workspace/hooks/useWorkspacePersistence";
import { useWorkspaceExternalSync } from "@/app/workspace/hooks/useWorkspaceExternalSync";
import { useBoardViewerRole } from "@/app/workspace/hooks/useBoardViewerRole";
import { useCollectionRevisionNotice } from "@/app/workspace/hooks/useCollectionRevisionNotice";
import { normalizeCollection, type CollectionSources } from "@/app/workspace/collections/model";
import { CollectionSurface } from "@/app/workspace/renderers/CollectionSurface";
import { fetchRemoteBoard } from "@/app/workspace/hooks/workspaceBoardApi";

function LoadedCollection({ boardId, blockId, viewer }: { boardId: string; blockId: string; viewer: boolean }) {
  const persistence = useWorkspacePersistence(boardId);
  useWorkspaceExternalSync(boardId, { live: false, hasUnsavedLocalChanges: persistence.isSavePending });
  useBoardViewerRole(boardId);
  const revisionNotice = useCollectionRevisionNotice(boardId);
  const blocks = useWorkspaceStore(s => s.blocks);
  const activeBoardId = useWorkspaceStore(s => s.boardId);
  const readOnly = useWorkspaceStore(s => s.isReadOnly);
  const block = activeBoardId === boardId ? blocks[blockId] : undefined;
  const sources = useMemo<CollectionSources>(() => Object.fromEntries(Object.entries(blocks)
    .filter(([id, item]) => id !== blockId && item.type === "collection")
    .map(([id, item]) => [id, normalizeCollection(item.data as never)])), [blocks, blockId]);
  const data = block?.type === "collection" ? normalizeCollection(block.data) : null;
  const update = useWorkspaceStore(s => s.updateBlock);
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3"><Link href="/collections" className="text-sm text-blue-600 hover:underline">← All Collections</Link><span className="text-xs text-slate-400">/</span><Link href={"/workspace?id=" + encodeURIComponent(boardId)} className="text-sm text-slate-500 hover:underline">Open canvas</Link></div>
      <span role="status" className="text-xs text-slate-500">{persistence.isSavePending ? "Saving..." : persistence.saveError ? "Save failed: " + persistence.saveError : "Synced with Workspace"}</span>
    </header>
    {(persistence.isLoadingBoard || !persistence.isBoardReady) && !persistence.loadError ? <p className="p-6" role="status">Loading...</p> : null}
    {persistence.loadError ? <p className="p-6" role="alert">This Workspace is unavailable or access was denied.</p> : null}
    {persistence.isBoardReady && !persistence.loadError && !data ? <p className="p-6" role="alert">Collection not found. It may have been deleted from Workspace.</p> : null}
    {persistence.isBoardReady && !persistence.loadError && data &&
      <div className="min-h-0 flex-1"><CollectionSurface standalone blockId={blockId} data={data} sources={sources} readOnly={viewer || readOnly || Boolean(block?.style?.isLocked)} revisionNotice={revisionNotice} onChange={next => update(blockId, { data: next })} /></div>}
  </div>;
}

export default function CollectionAppClient({ boardId, blockId }: { boardId: string; blockId: string }) {
  const [authorized, setAuthorized] = useState(false);
  const [viewer, setViewer] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAuthorized(false); setViewer(true); setError("");
    void fetchRemoteBoard(boardId).then(board => {
      if (!active) return;
      if (!board) { setError("Collection unavailable or access denied"); return; }
      const blocks = board.blocks;
      const item = blocks && typeof blocks === "object" && !Array.isArray(blocks)
        ? (blocks as Record<string, { type?: string }>)[blockId] : null;
      if (item?.type !== "collection") { setError("Collection not found"); return; }
      setViewer(board.viewerRole === "VIEWER");
      setAuthorized(true);
    });
    return () => { active = false; };
  }, [boardId, blockId]);
  return <ProtectedRoute devBypass={process.env.NODE_ENV !== "production" && Boolean(process.env.NEXT_PUBLIC_WORKSPACE_DEV_USER_EMAIL)}>
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {error && <p className="p-6" role="alert">{error} <Link href="/collections" className="text-blue-600 underline">Browse Collections</Link></p>}
      {!authorized && !error && <p className="p-6" role="status">Checking Collection access...</p>}
      {authorized && <LoadedCollection key={boardId} boardId={boardId} blockId={blockId} viewer={viewer} />}
    </main>
  </ProtectedRoute>;
}
