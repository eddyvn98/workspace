"use client";

import { useCallback } from "react";
import type React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createDualTransform, type CanvasBlock, type Position } from "../types/block";
import { blockWorldAabb } from "../utils/blockRects";
import { screenToCanvas } from "../utils/geometry";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";
import { uploadWorkspaceDocumentUnderBoard } from "../utils/workspaceDocumentFiling";
import { saveRemoteBoard } from "./workspaceBoardApi";
import { boardKey, upsertIndexEntry } from "./workspaceBoardIndex";
import { wasBoardSelfCreated } from "../utils/selfCreatedBoards";
import { announceWorkspaceBoardPersisted } from "./useWorkspaceRemoteBoardId";

const DEFAULT_IMAGE_SIZE = { w: 240, h: 180 };
const DEFAULT_FILE_SIZE = { w: 220, h: 64 };
// Tall enough to show a few lines of an embedded PDF preview (see
// renderers/FileBlock.tsx's canPreview) rather than a sliver a user has to
// resize before it's useful.
const DEFAULT_PREVIEWABLE_FILE_SIZE = { w: 320, h: 400 };

function nextTransform(canvasPoint: Position, size: { w: number; h: number }) {
  const blockCount = Object.keys(useWorkspaceStore.getState().blocks).length;
  return createDualTransform({
    x: canvasPoint.x - size.w / 2,
    y: canvasPoint.y - size.h / 2,
    w: size.w,
    h: size.h,
    rotation: 0,
    zIndex: blockCount,
  });
}

/** Topmost `image` block whose canvas-space box contains the drop point, if
 *  any — checked in paint order (last in blockOrder is on top) so dropping
 *  onto an overlapping stack replaces the one the user actually sees. */
function findImageBlockAtPoint(canvasPoint: Position): string | null {
  const { blocks, blockOrder } = useWorkspaceStore.getState();
  for (let i = blockOrder.length - 1; i >= 0; i -= 1) {
    const id = blockOrder[i];
    if (blocks[id]?.type !== "image") continue;
    const rect = blockWorldAabb(blocks, id);
    if (!rect) continue;
    if (
      canvasPoint.x >= rect.x &&
      canvasPoint.x <= rect.x + rect.width &&
      canvasPoint.y >= rect.y &&
      canvasPoint.y <= rect.y + rect.height
    ) {
      return id;
    }
  }
  return null;
}

async function handleImageDrop(imageFile: File, canvasPoint: Position): Promise<void> {
  const uploaded = await uploadWorkspaceImageWithOriginal(imageFile);
  if (!uploaded) throw new Error("Image upload failed");
  const { url: imageUrl, downloadUrl } = uploaded;

  const targetImageId = findImageBlockAtPoint(canvasPoint);
  const { addBlock, updateBlock, setSelection } = useWorkspaceStore.getState();

  if (targetImageId) {
    const targetBlock = useWorkspaceStore.getState().blocks[targetImageId] as CanvasBlock<"image">;
    updateBlock(targetImageId, {
      data: { ...targetBlock.data, url: imageUrl, downloadUrl, alt: imageFile.name, extraUrls: undefined, activeIndex: 0, imageFlowOrigin: undefined, resourceId: undefined },
    });
    const indexed = await uploadWorkspaceDocumentUnderBoard(useWorkspaceStore.getState().boardId, imageFile);
    if (indexed.resource) updateBlock(targetImageId, { data: { ...useWorkspaceStore.getState().blocks[targetImageId]!.data, resourceId: indexed.resource.id } });
    setSelection([targetImageId]);
    return;
  }

  const newId = createBlockId();
  const now = Date.now();
  const newBlock: CanvasBlock<"image"> = {
    id: newId,
    type: "image",
    transform: nextTransform(canvasPoint, DEFAULT_IMAGE_SIZE),
    data: { url: imageUrl, downloadUrl, alt: imageFile.name },
    createdAt: now,
    updatedAt: now,
  };
  addBlock(newBlock);
  const indexed = await uploadWorkspaceDocumentUnderBoard(useWorkspaceStore.getState().boardId, imageFile);
  if (indexed.resource) updateBlock(newId, { data: { ...useWorkspaceStore.getState().blocks[newId]!.data, resourceId: indexed.resource.id } });
  setSelection([newId]);
}

/** A brand-new board only exists in memory until the autosave debounce fires
 *  (see useWorkspacePersistence), so dropping a file onto it right away used
 *  to 404 against a board row the server had never seen. Users expect a
 *  fresh map to work immediately, so a self-created board that hasn't been
 *  confirmed persisted yet is saved eagerly here, ahead of the upload. */
async function ensureBoardExistsRemote(boardId: string): Promise<void> {
  if (!wasBoardSelfCreated(boardId)) return;
  try {
    if (window.localStorage.getItem(boardKey(boardId))) return;
  } catch {
    // Fall through and try the remote save anyway.
  }

  const state = useWorkspaceStore.getState();
  const result = await saveRemoteBoard(boardId, {
    title: state.title,
    blocks: state.blocks,
    blockOrder: state.blockOrder,
    connectors: state.connectors,
    camera: state.camera,
    frames: state.frames,
    treeLayoutDirection: state.treeLayoutDirection,
    treeGrowthMode: state.treeGrowthMode,
    treeLayoutFamily: state.treeLayoutFamily,
    treeTimelineBranchMode: state.treeTimelineBranchMode,
    treeTimelineDescendantStyle: state.treeTimelineDescendantStyle,
    treeCatalogDescendantStyle: state.treeCatalogDescendantStyle,
  });
  if (!result.ok) return;

  try {
    window.localStorage.setItem(boardKey(boardId), JSON.stringify({ ...state, savedAt: Date.now() }));
    upsertIndexEntry({ id: boardId, title: state.title, updatedAt: Date.now() });
  } catch {
    // Ignore localStorage quota errors — the remote save already succeeded.
  }
  announceWorkspaceBoardPersisted(boardId);
}

/** Non-image drop: stores the original bytes as a WorkspaceResource and
 *  creates a `file` block referencing it. See renderers/FileBlock.tsx. The
 *  text for the AI is filed separately by the drop handler below. */
async function handleFileDrop(file: File, canvasPoint: Position): Promise<void> {
  const boardId = useWorkspaceStore.getState().boardId;
  if (!boardId) return;
  await ensureBoardExistsRemote(boardId);

  const indexed = await uploadWorkspaceDocumentUnderBoard(boardId, file);
  let resource = indexed.resource;
  if (!resource) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/workspaces/${boardId}/resources`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
    resource = (await res.json())?.resource;
  }
  if (!resource?.id || !resource?.latestVersion) return;

  const { addBlock, setSelection } = useWorkspaceStore.getState();
  const newId = createBlockId();
  const now = Date.now();
  const previewArtifact = resource.latestVersion.previewArtifact as
    | { status: "PENDING" | "READY" | "FAILED" | "UNSUPPORTED" }
    | null;
  const isPreviewable =
    resource.mimeType === "application/pdf" ||
    String(resource.mimeType).startsWith("image/") ||
    previewArtifact?.status === "READY";
  const newBlock: CanvasBlock<"file"> = {
    id: newId,
    type: "file",
    transform: nextTransform(canvasPoint, isPreviewable ? DEFAULT_PREVIEWABLE_FILE_SIZE : DEFAULT_FILE_SIZE),
    data: {
      resourceId: resource.id,
      filename: resource.filename,
      mimeType: resource.mimeType,
      sizeBytes: resource.latestVersion.sizeBytes,
      previewArtifact: previewArtifact ?? undefined,
    },
    createdAt: now,
    updatedAt: now,
  };
  addBlock(newBlock);
  setSelection([newId]);
}

/**
 * Lets the user drag a file from the OS file explorer/desktop straight onto
 * the canvas. An image becomes an image block (unchanged v1 behavior);
 * anything else becomes a `file` block referencing a WorkspaceResource
 * (Checkpoint 5-7 of workspace-resource-roadmap.md) — before this, dropping
 * a non-image file was a silent no-op (no preventDefault, so the browser
 * would try to navigate to/open the file instead of the canvas doing
 * anything with it). Complements useImagePasteFromClipboard.ts, which only
 * handles Ctrl+V and only ever handled images.
 */
export function useImageDropFromOS() {
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const droppedFiles = Array.from(files);
    const imageFile = droppedFiles.find((f) => f.type.startsWith("image/"));
    const targetFile = imageFile ?? droppedFiles[0];
    if (!targetFile) return;

    e.preventDefault();

    const dropClientPoint = { x: e.clientX, y: e.clientY };
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasPoint = screenToCanvas(
      { x: dropClientPoint.x - rect.left, y: dropClientPoint.y - rect.top },
      useWorkspaceStore.getState().camera
    );

    try {
      if (imageFile) {
        await handleImageDrop(imageFile, canvasPoint);
      } else {
        await handleFileDrop(targetFile, canvasPoint);
      }
    } catch (err) {
      console.error("Workspace file drop upload failed:", err);
    }
  }, []);

  return { onDragOver, onDrop };
}

export default useImageDropFromOS;
