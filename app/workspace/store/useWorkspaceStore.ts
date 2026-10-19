import { create } from "zustand";
import { isTableBlock, resolveTransform, type BlockId, type BlockStyle, type CanvasBlock, type FreehandToolType, type ShapeKind, type Transform } from "../types/block";
import type { AnchorSide, CanvasConnector, ConnectorId } from "../types/connector";
import { imageFlowConnectionError } from "../connectors/imageFlowConnection";
import type { CameraFrame, CameraState } from "../types/camera";
import { DEFAULT_CAMERA } from "../types/camera";
import type { WorkspaceComment } from "../hooks/workspaceCommentApi";
import type { WorkspaceViewer } from "../hooks/workspacePresenceApi";
import type { TreeDirection, TreeGrowthMode } from "../layout/treeLayout";
import type { TreeLayoutFamily } from "../layout/treeviewLayout";
import { DEFAULT_WORKSPACE_CONNECTOR_LINE_TYPE, withWorkspaceConnectorDefaults, type WorkspaceConnectorLineType, type WorkspaceConnectorPaletteId } from "../connectors/connectorStyle";
import { currentMapLayout } from "../layout/mapRoot";
import { markWorkspaceMutation } from "../utils/workspaceMutationIntent";
import { removeAttachmentFromTables } from "../utils/tableAttachments";
import { appendCollectionAudit } from "../collections/collectionAudit";
import { deletedCollectionIds, pruneDeletedCollectionLinks, unbindDeletedCollection } from "../collections/collectionBoardIntegrity";
import { isCollectionBlockPayload } from "../collections/model";
import { reconcileWorkspaceDocTables, removeWorkspaceDocReferences } from '../utils/workspaceDocReferences';
import type { WorkspaceStore } from "./workspaceStoreTypes";
export type { WorkspaceInlineRichEditorActiveMarks, WorkspaceInlineRichEditorCommands, WorkspaceStore } from "./workspaceStoreTypes";

const ZERO_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  blocks: {},
  blockOrder: [],
  selectedBlockIds: [],
  quickAddHandoff: null,
  setQuickAddHandoff: (handoff) => set({ quickAddHandoff: handoff }),
  clearQuickAddHandoff: () => set({ quickAddHandoff: null }),

  addBlock: (block) =>
    set((state) => {
      if (state.isReadOnly) return state;
      return {
        blocks: { ...state.blocks, [block.id]: block },
        blockOrder: [...state.blockOrder, block.id],
      };
    }),

  updateBlock: (id, patch) =>
    set((state) => {
      if (state.isReadOnly) return state;
      const existing = state.blocks[id];
      if (!existing) return state;
      const currentCollection = existing.type === "collection" && isCollectionBlockPayload(existing.data)
        ? existing.data : undefined;
      const collectionPatch = patch.data === undefined ? undefined
        : isCollectionBlockPayload(patch.data) ? patch.data : null;
      if (existing.type === "collection" && (!currentCollection || collectionPatch === null)) return state;
      const data = currentCollection && collectionPatch
        ? appendCollectionAudit(currentCollection, collectionPatch,
          state.currentUserEmail ?? "Editor") : undefined;
      const updated = { ...existing, ...patch, ...(data ? { data } : {}),
        updatedAt: Date.now(), lastEditedBy: state.currentUserEmail ?? existing.lastEditedBy } as CanvasBlock;
      const next = reconcileWorkspaceDocTables({ ...state.blocks, [id]: updated }, id);
      const removed = existing.type === "collection" && updated.type === "collection"
        ? deletedCollectionIds(existing.data, updated.data) : new Set<string>();
      return { blocks: pruneDeletedCollectionLinks(next, id, removed, state.currentUserEmail ?? "Editor").blocks };
    }),

  restoreBlockVersion: (id, version) =>
    set((state) => {
      if (state.isReadOnly || !state.blocks[id]) return state;
      markWorkspaceMutation("node.restore");
      const current = state.blocks[id];
      return {
        blocks: reconcileWorkspaceDocTables({
          ...state.blocks,
          [id]: {
            ...version,
            id,
            createdAt: current.createdAt,
            updatedAt: Date.now(),
            lastEditedBy: state.currentUserEmail ?? current.lastEditedBy,
          },
        }, id),
      };
    }),

  updateBlockTransform: (id, patch, kind) =>
    set((state) => {
      if (state.isReadOnly) return state;
      const existing = state.blocks[id];
      if (!existing) return state;
      // Falls back to the block's other (currently-resolved) slot before
      // ZERO_TRANSFORM — a block positioned only by `computed` (tree
      // auto-arrange, see CONTRACTS.md §24) must inherit its real w/h/zIndex
      // the first time a drag/resize/rotate writes its `override`, not reset
      // to a hardcoded 160x80 box.
      const base = existing.transform[kind] ?? resolveTransform(existing.transform, ZERO_TRANSFORM);
      return {
        blocks: {
          ...state.blocks,
          [id]: {
            ...existing,
            transform: { ...existing.transform, [kind]: { ...base, ...patch } },
            updatedAt: Date.now(),
            lastEditedBy: state.currentUserEmail ?? existing.lastEditedBy,
          },
        },
      };
    }),

  removeBlock: (id) =>
    set((state) => {
      if (state.isReadOnly) return state;
      let rest = { ...state.blocks };
      delete rest[id];
      rest = removeWorkspaceDocReferences(rest, id);
      if (state.blocks[id]?.type === "collection") Object.assign(rest, unbindDeletedCollection(rest, id, state.currentUserEmail ?? "Editor"));
      const attachmentChanges = removeAttachmentFromTables(state.blocks, id);
      for (const [tableId, cellItems] of Object.entries(attachmentChanges)) {
        const table = rest[tableId];
        if (table && isTableBlock(table)) {
          rest[tableId] = { ...table, data: { ...table.data, cellItems } };
        }
      }
      return {
        blocks: rest,
        blockOrder: state.blockOrder.filter((blockId) => blockId !== id),
        selectedBlockIds: state.selectedBlockIds.filter((blockId) => blockId !== id),
      };
    }),

  setSelection: (ids) => set({ selectedBlockIds: ids }),
  setBlockOrder: (blockOrder) =>
    set((state) => (state.isReadOnly ? state : { blockOrder })),

  connectors: {},
  treeConnectorLineType: DEFAULT_WORKSPACE_CONNECTOR_LINE_TYPE, treeConnectorPaletteId: "default",
  addConnector: (connector) => {
    let added = false;
    set((state) => {
      if (state.isReadOnly || imageFlowConnectionError(state.blocks, state.connectors, connector)) return state;
      const mapLayout = currentMapLayout(state, connector.fromBlockId);
      const normalized = withWorkspaceConnectorDefaults(connector, mapLayout.connectorLineType, mapLayout.connectorPaletteId, Object.keys(state.connectors).length);
      added = true;
      return { connectors: { ...state.connectors, [connector.id]: normalized } };
    });
    return added;
  },
  removeConnector: (id) =>
    set((state) => {
      if (state.isReadOnly) return state;
      const rest = { ...state.connectors };
      delete rest[id];
      return {
        connectors: rest,
        selectedConnectorId: state.selectedConnectorId === id ? null : state.selectedConnectorId,
      };
    }),
  selectedConnectorId: null,
  setSelectedConnectorId: (id) => set({ selectedConnectorId: id }),

  camera: DEFAULT_CAMERA,
  setCamera: (patch) => set((state) => ({ camera: { ...state.camera, ...patch } })),

  frames: [],
  setFrames: (frames) => set({ frames }),

  pendingConnectorFrom: null,
  pendingConnectorFromSide: null,
  startPendingConnector: (blockId, fromSide) => set({ pendingConnectorFrom: blockId, pendingConnectorFromSide: fromSide ?? null }),
  clearPendingConnector: () => set({ pendingConnectorFrom: null, pendingConnectorFromSide: null }),

  formatPainterStyle: null,
  setFormatPainterStyle: (style) => set({ formatPainterStyle: style }),

  isDrawMode: false,
  setIsDrawMode: (value) => set({ isDrawMode: value }),
  activeFreehandTool: "pen",
  setActiveFreehandTool: (tool) => set({ activeFreehandTool: tool }),


  dragMode: "pan",
  setDragMode: (mode) => set({ dragMode: mode }),

  isDraggingBlock: false,
  setIsDraggingBlock: (value) => set({ isDraggingBlock: value }),
  draggedBlockIds: [],
  setDraggedBlockIds: (ids) => set({ draggedBlockIds: ids }),

  activeConnectorTool: null,
  setActiveConnectorTool: (tool) => set({ activeConnectorTool: tool }),

  armedShapeKind: null,
  setArmedShapeKind: (kind) => set({ armedShapeKind: kind }),

  title: "New Mindmap",
  setTitle: (title) => set((state) => (state.isReadOnly ? state : { title })),

  boardId: "",
  setBoardId: (boardId) => set({ boardId }),

  isCommentMode: false,
  setIsCommentMode: (value) => set({ isCommentMode: value, activeCommentBlockId: null }),
  chatPanelWidth: 0,
  setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
  activeCommentBlockId: null,
  setActiveCommentBlockId: (id) => set({ activeCommentBlockId: id }),
  filePreviewPage: {},
  setFilePreviewPage: (id, page) => set((state) => ({ filePreviewPage: { ...state.filePreviewPage, [id]: page } })),
  filePreviewPageCount: {},
  setFilePreviewPageCount: (id, count) => set((state) => ({ filePreviewPageCount: { ...state.filePreviewPageCount, [id]: count } })),
  imageNaturalAspect: {},
  setImageNaturalAspect: (id, ratio) => set((state) => ({ imageNaturalAspect: { ...state.imageNaturalAspect, [id]: ratio } })),
  comments: [],
  setComments: (comments) => set({ comments }),

  treeLayoutDirection: "right",
  setTreeLayoutDirection: (direction) => set({ treeLayoutDirection: direction }),

  treeGrowthMode: "one-side",
  setTreeGrowthMode: (mode) => set({ treeGrowthMode: mode }),

  treeLayoutFamily: "hierarchy",
  setTreeLayoutFamily: (family) => set({ treeLayoutFamily: family }),

  treeTimelineBranchMode: "auto",
  setTreeTimelineBranchMode: (mode) => set({ treeTimelineBranchMode: mode }),
  treeTimelineDescendantStyle: "tree",
  setTreeTimelineDescendantStyle: (style) => set({ treeTimelineDescendantStyle: style }),
  treeCatalogDescendantStyle: "tree",
  setTreeCatalogDescendantStyle: (style) => set({ treeCatalogDescendantStyle: style }),

  isReadOnly: false,
  setIsReadOnly: (value) => set({ isReadOnly: value }),

  remoteViewers: [],
  setRemoteViewers: (viewers) => set({ remoteViewers: viewers }),

  currentUserEmail: null,
  setCurrentUserEmail: (email) => set({ currentUserEmail: email }),

  imageLightbox: null,
  setImageLightbox: (value) => set({ imageLightbox: value }),

  pendingEditBlockId: null,
  setPendingEditBlockId: (id) => set({ pendingEditBlockId: id }),
  pendingFocusLineId: null,
  setPendingFocusLineId: (id) => set({ pendingFocusLineId: id }),
  pendingEditTableCell: null,
  setPendingEditTableCell: (value) => set({ pendingEditTableCell: value }),
  editingBlockId: null,
  setEditingBlockId: (id) => set({ editingBlockId: id }),
  pendingDescriptionBlockId: null,
  setPendingDescriptionBlockId: (id) => set({ pendingDescriptionBlockId: id }),
  activeRichTextEditor: null,
  setActiveRichTextEditor: (value) => set({ activeRichTextEditor: value }),
}));
