"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspacePersistence, listWorkspaceBoards } from "../hooks/useWorkspacePersistence";
import { useWorkspaceBoardId } from "../hooks/useWorkspaceBoardId";
import { useWorkspaceFocusLineFromUrl } from "../hooks/useWorkspaceFocusLineFromUrl";
import { useWorkspaceKeyboardShortcuts } from "../hooks/useWorkspaceKeyboardShortcuts";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { WorkspaceLoadErrorOverlay } from "./WorkspaceLoadErrorOverlay";
import { WorkspaceLoadingOverlay } from "./WorkspaceLoadingOverlay";
import { WorkspaceFloatingToolbar } from "./WorkspaceFloatingToolbar";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceFormatPainterBanner } from "./WorkspaceFormatPainterBanner";
import { WorkspaceViewportBar } from "./WorkspaceViewportBar";
import { BlockFrame } from "./BlockFrame";
import { WorkspaceMinimap } from "./WorkspaceMinimap";
import { SelectionBoundary } from "./SelectionBoundary";
import { GroupResizeHandles } from "./GroupResizeHandles";
import { BlockStylePanel } from "./BlockStylePanel";
import { WorkspaceSelectionToolbar } from "./WorkspaceSelectionToolbar";
import { ConnectorStylePanel } from "./ConnectorStylePanel";
import { SearchReplacePanel } from "./SearchReplacePanel";
import { WorkspaceFramesPanel } from "./WorkspaceFramesPanel";
import { WorkspacePresentOverlay } from "./WorkspacePresentOverlay";
import { CanvasBackgroundPicker } from "./CanvasBackgroundPicker";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { WorkspaceReadOnlyBanner } from "./WorkspaceReadOnlyBanner";
import { useWorkspaceSeenMarker } from "../hooks/useWorkspaceSeenMarker";
import { useBoardViewerRole } from "../hooks/useBoardViewerRole";
import { CommentComposer } from "./CommentComposer";
import { WorkspaceCommentsPanel } from "./WorkspaceCommentsPanel";
import { WorkspaceImageLightbox } from "./WorkspaceImageLightbox";
import { useWorkspaceComments } from "../hooks/useWorkspaceComments";
import { useWorkspaceRealtime } from "../hooks/useWorkspaceRealtime";
import { useWorkspaceExternalSync } from "../hooks/useWorkspaceExternalSync";
import { useSearchReplace } from "../hooks/useSearchReplace";
import { useImagePasteFromClipboard } from "../hooks/useImagePasteFromClipboard";
import { useCanvasBackground } from "../hooks/useCanvasBackground";
import { useWorkspaceBlockDragging } from "../hooks/useWorkspaceDragStatus";
import { useCanvasToolsPanelToggle } from "../hooks/useCanvasToolsPanelToggle";
import { useWorkspaceMinimapAutoShow } from "../hooks/useWorkspaceMinimapAutoShow";
import { useWorkspaceInitialFit } from "../hooks/useWorkspaceInitialFit";
import { useWorkspaceViewportControls } from "../hooks/useWorkspaceViewportControls";
import { useWorkspaceCanvasAutoFit } from "../hooks/useWorkspaceCanvasAutoFit";
import { useHiddenBlocks } from "../hooks/useHiddenBlocks";
import { createWorkspaceBlankMap } from "./WorkspaceMapLayoutAdapter";
import type { CanvasBlock } from "../types/block";
import { selectedMapRootId } from "../layout/mapRoot";
import { findWorkspaceMapLayoutPalette } from "../utils/layout";
import { applyWorkspaceStylePreset } from "../utils/layout/workspaceStylePreset";
import { attachmentTransform, collectAttachedBlockIds, findTableAttachment } from "../utils/tableAttachments";
import { useProgressiveBlockOrder } from "../hooks/useProgressiveBlockOrder";

export function WorkspacePage() {
  const isBlockDragging = useWorkspaceBlockDragging();
  const canvasBackgroundColor = useCanvasBackground();
  const { isCanvasToolsPanelOpen } = useCanvasToolsPanelToggle();
  const boardId = useWorkspaceBoardId();
  useWorkspaceFocusLineFromUrl(boardId);
  const { isSavePending, saveError, loadError, isLoadingBoard, isBoardReady, hasSavedCamera } = useWorkspacePersistence(boardId ?? "");
  useWorkspaceComments(boardId ?? "");
  // A live session when one is available, and nothing at all when it is not:
  // the REST autosave above and the presence poll keep working either way.
  // REST must finish hydrating the board before a realtime room is allowed to
  // project or seed content. Otherwise the room can replay the previous
  // store snapshot over the board that was just loaded.
  const realtime = useWorkspaceRealtime(boardId ?? "", isBoardReady && !loadError);
  // Fallback for what the live room cannot deliver (no room, or a dropped
  // push): without it a board changed by another person or the AI outside
  // this tab's own chat turn stayed stale until a manual reload.
  useWorkspaceExternalSync(boardId ?? "", { live: realtime.live, hasUnsavedLocalChanges: isSavePending });
  useBoardViewerRole(boardId ?? "");
  useWorkspaceSeenMarker(boardId);
  useImagePasteFromClipboard();
  const searchReplace = useSearchReplace();
  const { isHelpOpen, setIsHelpOpen, undo, redo, canUndo, canRedo } =
    useWorkspaceKeyboardShortcuts(searchReplace);

  const hiddenBlocks = useHiddenBlocks();
  const blocks = useWorkspaceStore((state) => state.blocks);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const contentBoardId = useWorkspaceStore((state) => state.boardId);
  const { visibleBlockOrder, visibleBlockIds } = useProgressiveBlockOrder(blockOrder, boardId, contentBoardId);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const camera = useWorkspaceStore((state) => state.camera);
  const zoom = camera.zoom;
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setSelectedConnectorId = useWorkspaceStore((state) => state.setSelectedConnectorId);
  const isCommentMode = useWorkspaceStore((state) => state.isCommentMode);
  const setIsCommentMode = useWorkspaceStore((state) => state.setIsCommentMode);
  const setCurrentUserEmail = useWorkspaceStore((state) => state.setCurrentUserEmail);
  const restoreBlockVersion = useWorkspaceStore((state) => state.restoreBlockVersion);
  const { data: session } = useSession();
  const [openChatRequest, setOpenChatRequest] = useState(0);
  // Only the true first-run state: this board has nothing on it yet and the
  // account has no other saved boards either — mirrors the legacy Mindmap
  // route's `showEmptyStateHint` so a brand-new user isn't dropped onto a
  // silently blank canvas. Checked once on mount (matches legacy: it
  // "disappears the moment a map is created", no dismiss state needed since
  // blockOrder.length gates the render below).
  const [hasNoSavedBoards, setHasNoSavedBoards] = useState(false);
  useEffect(() => {
    setHasNoSavedBoards(listWorkspaceBoards().length === 0);
  }, []);
  const [blockVersionPreview, setBlockVersionPreview] = useState<{ blockId: string; block: CanvasBlock } | null>(null);
  const { showMinimap, setShowMinimap, handleMouseEnter, handleMouseLeave } =
    useWorkspaceMinimapAutoShow(zoom);
  const { handleFitView } = useWorkspaceViewportControls();
  useWorkspaceCanvasAutoFit();
  useWorkspaceInitialFit(boardId, isLoadingBoard, loadError, blockOrder.length, hasSavedCamera, camera, handleFitView);

  useEffect(() => {
    const mockEmail = typeof document === "undefined"
      ? null
      : document.cookie.match(/(?:^|; )mock-email=([^;]*)/)?.[1] ?? null;
    setCurrentUserEmail(session?.user?.email ?? mockEmail ?? null);
  }, [session?.user?.email, setCurrentUserEmail]);

  useEffect(() => {
    setBlockVersionPreview(null);
  }, [boardId]);

  const exitBlockVersionPreview = useCallback(() => setBlockVersionPreview(null), []);
  const restoreBlockPreview = useCallback(() => {
    if (!blockVersionPreview) return;
    if (typeof window !== "undefined" && !window.confirm("Restore this block version? This creates a new edit and keeps the existing history.")) return;
    restoreBlockVersion(blockVersionPreview.blockId, blockVersionPreview.block);
    setBlockVersionPreview(null);
  }, [blockVersionPreview, restoreBlockVersion]);

  const activeRootId = useMemo(
    () => selectedMapRootId({ blocks, selectedBlockIds }),
    [blocks, selectedBlockIds],
  );
  const activeStylePreset = useMemo(() => {
    const presetId = activeRootId ? blocks[activeRootId]?.mapLayout?.stylePresetId : undefined;
    return findWorkspaceMapLayoutPalette(presetId ?? "default");
  }, [activeRootId, blocks]);
  const attachedBlockIds = useMemo(() => collectAttachedBlockIds(blocks), [blocks]);
  // Computed once per `blocks` change and handed to every BlockFrame instead
  // of each one scanning the whole blocks record itself (was O(N) per block,
  // O(N^2) total on every canvas update).
  const parentIdsWithChildren = useMemo(() => {
    const set = new Set<string>();
    for (const b of Object.values(blocks)) {
      if (b.parentId) set.add(b.parentId);
    }
    return set;
  }, [blocks]);
  const attachedTransforms = useMemo(() => {
    const next = new Map<string, ReturnType<typeof attachmentTransform>>();
    for (const blockId of attachedBlockIds) {
      const record = findTableAttachment(blocks, blockId);
      if (!record) continue;
      const transform = attachmentTransform(record.table, record.attachment, record.row, record.col);
      if (transform) next.set(blockId, transform);
    }
    return next;
  }, [attachedBlockIds, blocks]);
  const effectiveCanvasBackground = canvasBackgroundColor;

  const handleBackgroundPointerDown = useCallback(() => {
    setSelection([]);
    setSelectedConnectorId(null);
  }, [setSelection, setSelectedConnectorId]);

  const handleCreateBlankMap = useCallback(() => {
    createWorkspaceBlankMap();
  }, []);
  const handleOpenChatFromEmptyState = useCallback(() => {
    setOpenChatRequest((count) => count + 1);
  }, []);

  // `camera` (pan/zoom) changes on every wheel/drag tick and forces this
  // component to re-render, but none of these three lists depend on it.
  // Without memoizing them, every zoom/pan frame re-ran
  // applyWorkspaceStylePreset (a tree walk) for every block on the board,
  // even though BlockFrame itself would bail out via React.memo afterward.
  const tableBackgroundChildren = useMemo(
    () =>
      visibleBlockOrder.map((id) => {
        if (hiddenBlocks.has(id) || attachedBlockIds.has(id)) return null;
        const block = blocks[id];
        if (!block || block.type !== "table" || block.embeddedInDocId) return null;
        const preview = blockVersionPreview?.blockId === block.id ? blockVersionPreview.block : null;
        const displayBlock = applyWorkspaceStylePreset(
          preview ? { ...block, ...preview, id: block.id } : block,
          blocks,
        );
        return <BlockFrame key={block.id} boardId={boardId} block={displayBlock} isVersionPreview={preview !== null} onPreviewVersion={(version) => setBlockVersionPreview({ blockId: block.id, block: version })} hasChildren={parentIdsWithChildren.has(block.id)} />;
      }),
    [visibleBlockOrder, hiddenBlocks, attachedBlockIds, blocks, blockVersionPreview, boardId, parentIdsWithChildren],
  );
  const mainChildren = useMemo(
    () =>
      visibleBlockOrder.map((id) => {
        if (hiddenBlocks.has(id)) return null;
        if (attachedBlockIds.has(id)) return null;
        const block = blocks[id];
        if (!block || block.type === "table" || block.embeddedInDocId) return null;
        const preview = blockVersionPreview?.blockId === block.id ? blockVersionPreview.block : null;
        const displayBlock = applyWorkspaceStylePreset(
          preview ? { ...block, ...preview, id: block.id } : block,
          blocks,
        );
        return <BlockFrame key={block.id} boardId={boardId} block={displayBlock} isVersionPreview={preview !== null} onPreviewVersion={(version) => setBlockVersionPreview({ blockId: block.id, block: version })} hasChildren={parentIdsWithChildren.has(block.id)} />;
      }),
    [visibleBlockOrder, hiddenBlocks, attachedBlockIds, blocks, blockVersionPreview, boardId, parentIdsWithChildren],
  );
  const attachedChildren = useMemo(
    () =>
      visibleBlockOrder.map((id) => {
        if (hiddenBlocks.has(id) || !attachedBlockIds.has(id)) return null;
        const block = blocks[id];
        const transformOverride = attachedTransforms.get(id);
        if (!block || block.embeddedInDocId || !transformOverride) return null;
        const displayBlock = applyWorkspaceStylePreset(block, blocks);
        return <BlockFrame key={`attached-${block.id}`} boardId={boardId} block={displayBlock} transformOverride={transformOverride} isTableAttachment hasChildren={parentIdsWithChildren.has(block.id)} />;
      }),
    [visibleBlockOrder, hiddenBlocks, attachedBlockIds, attachedTransforms, blocks, boardId, parentIdsWithChildren],
  );

  return (
    <div
      data-workspace-root="true"
      data-workspace-map-style-preset={activeStylePreset.id}
      className="relative h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-950"
      style={{
        backgroundColor: effectiveCanvasBackground ?? undefined,
        "--workspace-chat-width": "0px",
        "--workspace-comments-width": isCommentMode ? "300px" : "0px",
      } as React.CSSProperties}
    >
      {/* Canvas stays anchored at the viewport's top-left so opening a right
          rail crops only its right edge; the top bar still overlays it and
          never changes the pointer-event origin. */}
      <WorkspaceCanvas
        visibleBlockIds={visibleBlockIds}
        renderConnectors={visibleBlockIds.size >= blockOrder.length}
        onBackgroundPointerDown={handleBackgroundPointerDown}
        backgroundChildren={tableBackgroundChildren}
      >
        {mainChildren}
        {attachedChildren}
      </WorkspaceCanvas>
      {blockVersionPreview && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-orange-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-orange-800 dark:bg-slate-900/95" data-workspace-version-preview>
          <span className="font-semibold text-orange-700 dark:text-orange-300">Viewing version: {versionTitle(blockVersionPreview.block) ?? "Untitled"}</span>
          <button type="button" onClick={exitBlockVersionPreview} className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Back to current</button>
          <button type="button" onClick={restoreBlockPreview} className="rounded-lg bg-orange-500 px-2 py-1 font-semibold text-white hover:bg-orange-600" data-workspace-version-restore>Restore this version</button>
        </div>
      )}
      {blockOrder.length === 0 && hasNoSavedBoards && !isLoadingBoard && !loadError && (
        <WorkspaceEmptyState
          onCreateBlankMap={handleCreateBlankMap}
          onOpenChat={handleOpenChatFromEmptyState}
        />
      )}
      {loadError ? (
        <WorkspaceLoadErrorOverlay />
      ) : null}
      {isLoadingBoard && !loadError ? <WorkspaceLoadingOverlay /> : null}
      <WorkspaceTopBar
        boardId={boardId}
        onHelpClick={() => setIsHelpOpen(true)}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        isSearchOpen={searchReplace.isOpen}
        onToggleSearch={() => (searchReplace.isOpen ? searchReplace.close() : searchReplace.open())}
        isSavePending={isSavePending}
        saveError={saveError}
        openChatRequest={openChatRequest}
        isBoardLoading={isLoadingBoard}
      />
      <WorkspaceFloatingToolbar />
      <WorkspaceFormatPainterBanner />
      <WorkspaceReadOnlyBanner />
      <SelectionBoundary />
      <GroupResizeHandles />
      {blockOrder.length > 0 && showMinimap && (
        <WorkspaceMinimap
          onClose={() => setShowMinimap(false)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}
      {!isBlockDragging && <>
        <WorkspaceSelectionToolbar />
        <BlockStylePanel />
      </>}
      <ConnectorStylePanel />
      <SearchReplacePanel search={searchReplace} />
      {isCanvasToolsPanelOpen && blockOrder.length > 0 && <WorkspaceFramesPanel />}
      {isCanvasToolsPanelOpen && blockOrder.length > 0 && <CanvasBackgroundPicker />}
      <WorkspacePresentOverlay />
      <WorkspaceViewportBar />
      <CommentComposer />
      {isCommentMode && <WorkspaceCommentsPanel onClose={() => setIsCommentMode(false)} />}
      <WorkspaceImageLightbox />
      <KeyboardShortcutsHelp
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}

export default WorkspacePage;

function versionTitle(block: CanvasBlock): string | null {
  const data = block.data as unknown;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const markdown = (data as { markdown?: unknown }).markdown;
    if (typeof markdown === "string" && markdown.trim()) return markdown;
  }
  return block.description?.trim() || null;
}
