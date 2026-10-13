import { NextResponse } from "next/server";
import {
  getResourceArtifactContent,
  getResourceContent,
  listResources,
  type ResourceSummary,
} from "@/lib/workspace/resource-repository";
import { getPdfPageCount, mapWithLimit } from "./pdfPageCount";
import { list, type JsonMap } from "./routeHelpers";

type BoardLike = { id: string; blocks: unknown; revision: number };

const FILE_COMMANDS = new Set(["list_files", "add_file_block", "pin_pdf_page"]);

function field(action: JsonMap, key: string): unknown {
  const params = action.params && typeof action.params === "object" ? action.params as JsonMap : {};
  return action[key] ?? params[key];
}

function reject(board: BoardLike, status: number, reason: string, error: string): NextResponse {
  return NextResponse.json({ error, reason, revision: board.revision }, { status });
}

/** PDF page count for a stored file: the original when it is a PDF, else its READY PDF preview. */
async function pageCountFor(boardId: string, email: string, resourceId: string, mimeType: string, previewReady: boolean): Promise<number | null> {
  try {
    if (mimeType === "application/pdf") {
      const content = await getResourceContent(boardId, email, resourceId);
      return content ? await getPdfPageCount(content.buffer) : null;
    }
    if (previewReady) {
      const preview = await getResourceArtifactContent(boardId, email, resourceId);
      return preview ? await getPdfPageCount(preview.buffer) : null;
    }
  } catch {
    return null;
  }
  return null;
}

function pinnedPage(data: JsonMap): number {
  const range = data.range && typeof data.range === "object" ? data.range as JsonMap : {};
  return Number.isInteger(range.page) && Number(range.page) >= 1 ? Number(range.page) : 1;
}

/** Read-only list_files, handled outside the board commit. Returns null when the batch has none. */
export async function handleFileReadActions(
  board: BoardLike,
  email: string,
  actions: JsonMap[],
): Promise<NextResponse | null> {
  const reads = actions.filter((item) => item.type === "list_files");
  if (reads.length === 0) return null;
  if (reads.length !== actions.length) {
    return reject(board, 400, "mixed_batch", "list_files must not be mixed with board edits");
  }
  let resources: ResourceSummary[];
  try {
    resources = await listResources(board.id, email);
  } catch {
    return reject(board, 403, "resources_unavailable", "Uploaded files are not accessible");
  }
  const files = await mapWithLimit(list(board.blocks).filter((block) => block.type === "file"), 4, async (block) => {
    const data = (block.data ?? {}) as JsonMap;
    const mimeType = String(data.mimeType ?? "");
    const previewReady = (data.previewArtifact as JsonMap | undefined)?.status === "READY";
    return {
      blockId: String(block.id),
      resourceId: String(data.resourceId ?? ""),
      filename: String(data.filename ?? ""),
      mimeType,
      pageCount: await pageCountFor(board.id, email, String(data.resourceId ?? ""), mimeType, previewReady),
      pinnedPage: pinnedPage(data),
    };
  });
  return NextResponse.json({
    success: true,
    ok: true,
    action: "list_files",
    actions: [{ type: "list_files", ids: files.map((file) => file.blockId), changed: false }],
    result: {
      files,
      resources: resources.map((resource) => ({
        resourceId: resource.id,
        filename: resource.filename,
        mimeType: resource.mimeType,
        sizeBytes: resource.latestVersion.sizeBytes,
        kind: resource.kind,
      })),
    },
    revision: board.revision,
  });
}

/** Resolves uploaded-resource metadata onto add_file_block / pin_pdf_page actions before they are applied. Returns a response on rejection. */
export async function enrichFileActions(
  board: BoardLike,
  email: string,
  actions: JsonMap[],
): Promise<JsonMap[] | NextResponse> {
  if (!actions.some((item) => FILE_COMMANDS.has(String(item.type)))) return actions;
  let resources: ResourceSummary[] | null = null;
  const out: JsonMap[] = [];
  for (const action of actions) {
    const type = String(action.type);
    if (type === "add_file_block") {
      const resourceId = String(field(action, "resourceId") ?? "").trim();
      try { resources ??= await listResources(board.id, email); } catch { resources = []; }
      const resource = resources.find((item) => item.id === resourceId);
      if (!resource) return reject(board, 422, "resource_not_found", "That file does not belong to this board; call list_files for valid resourceId values");
      const version = resource.latestVersion;
      const previewArtifact = version.previewArtifact ?? undefined;
      const pageCount = await pageCountFor(board.id, email, resource.id, resource.mimeType, previewArtifact?.status === "READY");
      const page = field(action, "page");
      if (page !== undefined && page !== null) {
        if (!(resource.mimeType === "application/pdf" || previewArtifact?.status === "READY")) {
          return reject(board, 422, "not_pdf", "Only PDF-previewable files can be placed on a specific page");
        }
        if (pageCount === null) return reject(board, 422, "page_count_unavailable", "The page count of this file could not be read, so a specific page cannot be validated");
        if (!Number.isInteger(page) || Number(page) < 1 || Number(page) > pageCount) {
          return reject(board, 422, "page_out_of_range", `page must be an integer from 1 to ${pageCount ?? "the page count"}`);
        }
      }
      out.push({ ...action, fileResource: { resourceId: resource.id, filename: resource.filename, mimeType: resource.mimeType, sizeBytes: version.sizeBytes, versionId: version.id, previewArtifact, pageCount } });
    } else if (type === "pin_pdf_page") {
      const blockId = String(field(action, "blockId") ?? field(action, "target") ?? "").trim();
      const block = list(board.blocks).find((item) => item.id === blockId);
      if (!block) return reject(board, 422, "block_not_found", "Block not found; call list_files for valid blockId values");
      const data = (block.data ?? {}) as JsonMap;
      if (block.type !== "file") return reject(board, 422, "not_file_block", "pin_pdf_page needs a file block");
      const previewReady = (data.previewArtifact as JsonMap | undefined)?.status === "READY";
      if (!(data.mimeType === "application/pdf" || previewReady)) return reject(board, 422, "not_pdf", "That file cannot be shown page by page because it is not a PDF");
      const pageCount = await pageCountFor(board.id, email, String(data.resourceId ?? ""), String(data.mimeType ?? ""), previewReady);
      if (pageCount === null) return reject(board, 422, "page_count_unavailable", "Could not read the page count of that PDF");
      const page = field(action, "page");
      if (!Number.isInteger(page) || Number(page) < 1 || Number(page) > pageCount) {
        return reject(board, 422, "page_out_of_range", `page must be an integer from 1 to ${pageCount}`);
      }
      out.push({ ...action, blockId, verifiedPageCount: pageCount });
    } else {
      out.push(action);
    }
  }
  return out;
}
