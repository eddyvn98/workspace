import type { WorkspaceInlineRichEditorActiveMarks, WorkspaceInlineRichEditorCommands } from "./workspaceRichEditorTypes";
export type { WorkspaceInlineRichEditorActiveMarks, WorkspaceInlineRichEditorCommands } from "./workspaceRichEditorTypes";
import type { BlockId, BlockStyle, CanvasBlock, FreehandToolType, ShapeKind, Transform } from "../types/block";
import type { AnchorSide, CanvasConnector, ConnectorId } from "../types/connector";
import type { CameraFrame, CameraState } from "../types/camera";
import type { WorkspaceComment } from "../hooks/workspaceCommentApi";
import type { WorkspaceViewer } from "../hooks/workspacePresenceApi";
import type { TreeDirection, TreeGrowthMode } from "../layout/treeLayout";
import type { TreeLayoutFamily } from "../layout/treeviewLayout";
import type { WorkspaceConnectorLineType, WorkspaceConnectorPaletteId } from "../connectors/connectorStyle";

export interface WorkspaceStore {
  blocks: Record<BlockId, CanvasBlock>;
  /** Paint/z order — independent of each block's `transform.zIndex` tie-breaks. */
  blockOrder: BlockId[];
  selectedBlockIds: BlockId[];

  /**
   * The quick-add handle that was just activated. Flowchart quick-add keeps
   * the source handle alive for the duration of the pointer handoff: selecting
   * the newly-created block can otherwise put its opposite handle over the
   * exact screen position where the pointer is still resting.
   *
   * This is deliberately transient UI state and is not part of a board
   * snapshot.
   */
  quickAddHandoff: { blockId: BlockId; direction: Exclude<AnchorSide, "center"> } | null;
  setQuickAddHandoff: (handoff: WorkspaceStore["quickAddHandoff"]) => void;
  clearQuickAddHandoff: () => void;

  addBlock: (block: CanvasBlock) => void;
  updateBlock: (id: BlockId, patch: Partial<Omit<CanvasBlock, "id" | "transform">>) => void;
  restoreBlockVersion: (id: BlockId, version: CanvasBlock) => void;
  /** Patches the "computed" or "override" slot of a block's DualTransform. */
  updateBlockTransform: (id: BlockId, patch: Partial<Transform>, kind: "override" | "computed") => void;
  removeBlock: (id: BlockId) => void;
  setSelection: (ids: BlockId[]) => void;
  setBlockOrder: (blockOrder: BlockId[]) => void;

  connectors: Record<ConnectorId, CanvasConnector>;
  treeConnectorLineType: WorkspaceConnectorLineType; treeConnectorPaletteId: WorkspaceConnectorPaletteId;
  addConnector: (connector: CanvasConnector) => boolean;
  removeConnector: (id: ConnectorId) => void;
  selectedConnectorId: ConnectorId | null;
  setSelectedConnectorId: (id: ConnectorId | null) => void;

  camera: CameraState;
  setCamera: (patch: Partial<CameraState>) => void;
  frames: CameraFrame[];
  setFrames: (frames: CameraFrame[]) => void;

  /** Source block of an in-progress drag-to-connect gesture, or null when idle. */
  pendingConnectorFrom: BlockId | null;
  pendingConnectorFromSide: AnchorSide | null;
  startPendingConnector: (blockId: BlockId, fromSide?: AnchorSide) => void;
  clearPendingConnector: () => void;

  /** Copied style from an in-progress format-painter gesture, or null when idle.
   *  Shared globally (not local component state) so a floating "painting style"
   *  indicator can react to it regardless of which UI copied it. */
  formatPainterStyle: BlockStyle | null;
  setFormatPainterStyle: (style: BlockStyle | null) => void;

  /** Transient UI mode: when true, dragging on the canvas background draws a
   *  freehand path block instead of panning/rubber-band-selecting. */
  isDrawMode: boolean;
  setIsDrawMode: (value: boolean) => void;
  /** Active freehand drawing tool (pen, highlighter, eraser, cad_line, square, circle, arrow_line). */
  activeFreehandTool: FreehandToolType;
  setActiveFreehandTool: (tool: FreehandToolType) => void;

  /** Drag interaction mode: "select" (default — left-drag rubber-band selects) or "pan" (left-drag pans the camera). Transient UI mode. */
  dragMode: "pan" | "select";
  setDragMode: (mode: "pan" | "select") => void;

  /** True for the duration of an active block drag (see useBlockDrag.ts) once
   *  it has crossed the activation threshold. ConnectorLayer reads this to
   *  skip its most expensive per-frame pass (line-overlap avoidance, O(paths
   *  × blocks)) while a drag is live — a diagram with many connectors (e.g.
   *  a flowchart-family map) made every drag frame anywhere on the board pay
   *  that cost otherwise. The final, settled render still runs it. */
  isDraggingBlock: boolean;
  setIsDraggingBlock: (value: boolean) => void;
  /** Exact block set moved by the active drag, including carried descendants.
   *  Transient UI state used by ConnectorLayer for live connector geometry. */
  draggedBlockIds: BlockId[];
  setDraggedBlockIds: (ids: BlockId[]) => void;

  /** Dedicated connector drawing tool mode (pick a line type, then drag from
   *  any block to any other block), or null when idle. See CONTRACTS.md §42. */
  activeConnectorTool: { lineType: "straight" | "curved" | "orthogonal"; arrowEnd: boolean; kind?: "image-flow" } | null;
  setActiveConnectorTool: (tool: { lineType: "straight" | "curved" | "orthogonal"; arrowEnd: boolean; kind?: "image-flow" } | null) => void;

  /** Armed shape kind for draw-to-size mode, or null when idle. See CONTRACTS.md §43. */
  armedShapeKind: ShapeKind | null;
  setArmedShapeKind: (kind: ShapeKind | null) => void;

  /** Document title, editable in the top bar. Local-only until a backend exists. */
  title: string;
  setTitle: (title: string) => void;

  /** Id of the board currently open (drives the per-board localStorage key — see
   *  useWorkspaceBoardId.ts / useWorkspacePersistence.ts). Local-only until a
   *  backend exists. */
  boardId: string;
  setBoardId: (boardId: string) => void;

  /** Transient UI mode: when true, clicking a block opens its comment thread
   *  instead of selecting/editing it. See CONTRACTS.md §22. */
  isCommentMode: boolean;
  setIsCommentMode: (value: boolean) => void;
  /** Current width (px) of the open AI chat side panel, 0 when closed. Tracked
   *  here (not just as a DOM CSS var) so the canvas auto-fit-scale effect can
   *  react to it without reaching into another component's local state. */
  chatPanelWidth: number;
  setChatPanelWidth: (width: number) => void;
  /** Which block's comment composer is currently open (comment mode's
   *  equivalent of the old app's single-composer-instance pattern). */
  activeCommentBlockId: BlockId | null;
  setActiveCommentBlockId: (id: BlockId | null) => void;
  /** All comments for the open board, refreshed by a polling hook — REST
   *  polling, no realtime channel (see CONTRACTS.md §22). */
  comments: WorkspaceComment[];
  setComments: (comments: WorkspaceComment[]) => void;

  /** PDF/file-block page currently being *browsed* — deliberately separate
   *  from `block.data.range.page` (the persisted/"pinned" page) so stepping
   *  through pages with the toolbar's prev/next doesn't trigger an autosave
   *  on every click. Ephemeral, like activeCommentBlockId above — never part
   *  of the saved board payload. See WorkspaceFileSelectionToolbar.tsx. */
  filePreviewPage: Record<BlockId, number>;
  setFilePreviewPage: (id: BlockId, page: number) => void;
  /** Filled in once pdfjs resolves a file block's page count (FilePdfCanvasPreview.tsx). */
  filePreviewPageCount: Record<BlockId, number>;
  setFilePreviewPageCount: (id: BlockId, count: number) => void;

  /** An `image` block's real width/height ratio, read off the loaded
   *  <img> (naturalWidth/naturalHeight) rather than the block's current
   *  frame — the frame can drift away from it after a free (non-Ctrl)
   *  resize, but Ctrl-locked resizing (see useBlockResize.ts) must always
   *  snap back to the image's own ratio, not whatever the frame happens to
   *  be. Ephemeral, same as the file-preview fields above. */
  imageNaturalAspect: Record<BlockId, number>;
  setImageNaturalAspect: (id: BlockId, ratio: number) => void;

  /** Growth direction for the tree auto-arrange flow (Tab/Enter), board-wide
   *  — matches the old app's map-level layout direction (CONTRACTS.md §24).
   *  Defaults to "right" (the old app's default too). */
  treeLayoutDirection: TreeDirection;
  setTreeLayoutDirection: (direction: TreeDirection) => void;

  /** Growth mode for the tree auto-arrange flow: "one-side" (default) grows
   *  all children in treeLayoutDirection; "both-side" splits root's direct
   *  children into two mirrored groups (CONTRACTS.md §26). */
  treeGrowthMode: TreeGrowthMode;
  setTreeGrowthMode: (mode: TreeGrowthMode) => void;

  /** Layout family for the tree auto-arrange flow: "hierarchy" (default —
   *  direction-based tree) or "treeview" (depth-column outline). See
   *  CONTRACTS.md §36. */
  treeLayoutFamily: TreeLayoutFamily;
  setTreeLayoutFamily: (family: TreeLayoutFamily) => void;

  treeTimelineBranchMode: "auto" | "one-side" | "one-side-reverse" | "alternate";
  setTreeTimelineBranchMode: (mode: "auto" | "one-side" | "one-side-reverse" | "alternate") => void;

  treeTimelineDescendantStyle: "tree" | "hierarchy";
  setTreeTimelineDescendantStyle: (style: "tree" | "hierarchy") => void;
  treeCatalogDescendantStyle: "tree" | "hierarchy";
  setTreeCatalogDescendantStyle: (style: "tree" | "hierarchy") => void;

  /** True when the caller's role on the open board is VIEWER (see
   *  CONTRACTS.md §33) — every content-mutating action below becomes a
   *  no-op. Set once per board load by useBoardViewerRole.ts; the server
   *  already rejects VIEWER writes independently (§21), this just stops the
   *  client from producing local-only changes that would silently fail to
   *  persist (a confusing UX, not a security hole — the 403 always wins). */
  isReadOnly: boolean;
  setIsReadOnly: (value: boolean) => void;

  /** Other collaborators currently viewing this board, refreshed on each
   *  presence heartbeat tick (see useWorkspacePresence.ts) — powers the
   *  presence focus ring (BlockPresenceRing.tsx) via each viewer's
   *  selectedBlockId. Excludes the caller themself (server-side filtered). */
  remoteViewers: WorkspaceViewer[];
  setRemoteViewers: (viewers: WorkspaceViewer[]) => void;

  /** The signed-in caller's email, set once by WorkspacePage.tsx via
   *  next-auth's useSession — stamped onto CanvasBlock.lastEditedBy by
   *  updateBlock/updateBlockTransform (see BlockAttributionDot.tsx). */
  currentUserEmail: string | null;
  setCurrentUserEmail: (email: string | null) => void;

  /** Full-size image viewer state — see WorkspaceImageLightbox.tsx.
   *  Set by ImageBlock.tsx on double-click, mirroring the old app's
   *  MindmapImageLightbox.tsx "store as bridge" convention (avoids
   *  threading a prop through the whole canvas/block-frame chain). */
  imageLightbox: { urls: string[]; index: number } | null;
  setImageLightbox: (value: { urls: string[]; index: number } | null) => void;

  /** Block a creation flow (toolbar "Add Text", Tab/Enter quick-add) just
   *  placed — TextBlock.tsx watches for its own id here to auto-enter edit
   *  mode once, then clears it, mirroring the old app's
   *  `setTimeout(() => startEditing(newId), 50)` after every node-creation
   *  action so a freshly created block is immediately typeable. */
  pendingEditBlockId: BlockId | null;
  setPendingEditBlockId: (id: BlockId | null) => void;
  /** A double-click that fell through a swimlane body cell's empty area
   *  (pointer-events:none - see TableBlock.tsx's passThroughEmptyCellClicks)
   *  down to the canvas background - WorkspaceCanvas.tsx's dblclick handler
   *  re-targets it here so the owning TableBlock can enter that cell's text
   *  edit mode itself, mirroring pendingEditBlockId's "outside trigger,
   *  self-clears" pattern above. */
  pendingEditTableCell: { tableId: BlockId; row: number; col: number } | null;
  setPendingEditTableCell: (value: { tableId: BlockId; row: number; col: number } | null) => void;
  /** A doc/slideDeck line's "Copy link to block" was opened via URL
   *  (?focusLine=<id>) — WorkspaceDocLineOverlay.tsx watches for its own
   *  editor to contain a node with this lineId, then scrolls/highlights it
   *  and self-clears, mirroring pendingEditBlockId's pattern above. */
  pendingFocusLineId: string | null;
  setPendingFocusLineId: (id: string | null) => void;
  editingBlockId: BlockId | null;
  setEditingBlockId: (id: BlockId | null) => void;
  pendingDescriptionBlockId: BlockId | null;
  setPendingDescriptionBlockId: (id: BlockId | null) => void;
  /** The rich-text (TipTap) editor currently open for in-place editing —
   *  set by WorkspaceShapeRichEditor.tsx while a shape's label is being
   *  edited, cleared on blur/unmount. Lets WorkspaceSelectionToolbar.tsx's
   *  Bold/Italic/Underline/Strikethrough/list buttons apply to the actual
   *  text SELECTION inside that editor — those buttons used to only ever
   *  patch a whole-block style flag on `block.data` (the right model for
   *  TextBlock.tsx's markdown field, meaningless for a shape's per-run rich
   *  content), so clicking them while editing a shape's label did nothing.
   *  A structural command surface, not a TipTap `Editor` import, so this
   *  core store file stays independent of any specific editor library. */
  activeRichTextEditor: { blockId: BlockId; commands: WorkspaceInlineRichEditorCommands; activeMarks: WorkspaceInlineRichEditorActiveMarks } | null;
  setActiveRichTextEditor: (value: WorkspaceStore["activeRichTextEditor"]) => void;
}
