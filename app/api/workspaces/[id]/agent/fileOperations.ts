import type { AgentBoardState } from "./operationsCore";
import { freePosition } from "./operationsCore";
import type { JsonMap } from "./routeHelpers";

type FileResult = { ids: string[]; operation: string };

const DEFAULT_FILE_SIZE = { w: 220, h: 64 };
const DEFAULT_PREVIEWABLE_FILE_SIZE = { w: 320, h: 400 };

const field = (raw: JsonMap, key: string): unknown =>
  raw[key] ?? (raw.params && typeof raw.params === "object" ? (raw.params as JsonMap)[key] : undefined);

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function previewable(mimeType: unknown, artifact: unknown): boolean {
  return mimeType === "application/pdf" || (artifact as JsonMap | undefined)?.status === "READY";
}

function addFileBlock(state: AgentBoardState, raw: JsonMap): string[] {
  // Only enrichFileActions output is trusted; a model-supplied fileResource is overwritten there.
  const file = raw.fileResource as JsonMap | undefined;
  if (!file || typeof file.resourceId !== "string") return [];
  const canPreview = previewable(file.mimeType, file.previewArtifact);
  const size = canPreview ? DEFAULT_PREVIEWABLE_FILE_SIZE : DEFAULT_FILE_SIZE;
  const position = freePosition(state, { x: num(field(raw, "x")) ?? 80, y: num(field(raw, "y")) ?? 80 }, size.w, size.h);
  const page = field(raw, "page");
  const createdAt = Date.now();
  const blockId = crypto.randomUUID();
  state.blocks[blockId] = {
    id: blockId,
    type: "file",
    transform: { computed: null, override: { x: position.x, y: position.y, w: size.w, h: size.h, rotation: 0, zIndex: state.blockOrder.length } },
    data: {
      resourceId: file.resourceId,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      ...(file.versionId ? { versionId: file.versionId } : {}),
      ...(file.previewArtifact ? { previewArtifact: file.previewArtifact } : {}),
      ...(Number.isInteger(page) && Number(page) > 1 ? { range: { page } } : {}),
    },
    createdAt,
    updatedAt: createdAt,
  };
  state.blockOrder.push(blockId);
  return [blockId];
}

function pinPdfPage(state: AgentBoardState, raw: JsonMap): string[] {
  const blockId = String(field(raw, "blockId") ?? field(raw, "target") ?? "");
  const block = state.blocks[blockId];
  const page = field(raw, "page");
  const pageCount = raw.verifiedPageCount;
  if (!block || block.type !== "file" || !Number.isInteger(page) || !Number.isInteger(pageCount)) return [];
  const data = (block.data ?? {}) as JsonMap;
  if (!previewable(data.mimeType, data.previewArtifact)) return [];
  if (Number(page) < 1 || Number(page) > Number(pageCount)) return [];
  block.data = { ...data, range: { page } };
  block.updatedAt = Date.now();
  return [blockId];
}

/** add_file_block and pin_pdf_page. Returns undefined for any other action type. */
export function applyFileAction(state: AgentBoardState, raw: JsonMap): FileResult | undefined {
  const type = String(raw.type ?? "").toLowerCase();
  if (type === "add_file_block") return { ids: addFileBlock(state, raw), operation: type };
  if (type === "pin_pdf_page") return { ids: pinPdfPage(state, raw), operation: type };
  return undefined;
}
