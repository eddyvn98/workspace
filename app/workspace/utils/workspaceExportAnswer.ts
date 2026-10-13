import { isCanvasMutationRequest, type ParsedDifyAgentAnswer } from "./workspaceDifyAgentResponse";
import { workspaceExportLink } from "./workspaceExportLink";

/** Whole-board downloads are read operations: verify the authenticated artifact, not a board revision. */
export async function verifyWorkspaceExportAnswer(
  parsed: ParsedDifyAgentAnswer, request: string, boardId: string | null,
): Promise<ParsedDifyAgentAnswer> {
  if (!boardId || !/(?:\bexport\b|xuất)/iu.test(request)) return parsed; // vi-allow: Vietnamese export intent.
  const formats = [...request.matchAll(/\b(json|markdown|opml|pptx|pdf|powerpoint)\b/gi)].map((match) => match[1].toLowerCase() === "powerpoint" ? "pptx" : match[1].toLowerCase());
  if (new Set(formats).size !== 1) return parsed;
  const remaining = request
    .replace(/tạo\s+(?:đường\s+(?:dẫn|link)|link)\s+(?:tải\s+(?:file|tệp)\s*(?:thật)?|tải xuống)/giu, "") // vi-allow: Vietnamese download-link intent.
    .replace(/\bcreate\s+(?:a\s+)?download\s+link\b/gi, "")
    .replace(/\b(?:PowerPoint|pptx|PDF)\s+có thể\s+chỉnh sửa\b/giu, "") // vi-allow: describes the exported file, not a board mutation.
    .replace(/(?:không|đừng)\s+(?:chỉnh\s+sửa|thay\s+đổi|sửa|xóa)\s+(?:nội\s+dung|workspace|board|dữ\s+liệu)/giu, ""); // vi-allow: negated edit request.
  if (isCanvasMutationRequest(remaining)) return parsed;
  const selection = /(?:\b(?:selected|selection|only|subset)\b|đã chọn|lựa chọn|(?:chỉ|riêng)\s+(?:bộ\s+)?(?:khối|nhánh|slide))/iu.test(request); // vi-allow: Vietnamese selection intent.
  const format = formats[0];
  const provided = workspaceExportLink(parsed.content, boardId, format, selection);
  const wholeBoard = /(?:workspace|board|toàn bộ)/iu.test(request); // vi-allow: whole workspace intent.
  if ((!wholeBoard || selection) && !provided) return parsed;
  const downloadUrl = provided ?? `/api/workspaces/${encodeURIComponent(boardId)}/export?format=${format}`;
  const vietnamese = /xuất/iu.test(request); // vi-allow: mirror the user's export language.
  const label = format === "pptx" ? "PowerPoint" : format.toUpperCase();
  try {
    const response = await fetch(downloadUrl, { method: "HEAD", credentials: "same-origin", cache: "no-store" });
    if (!response.ok || !response.headers.get("content-disposition")?.startsWith("attachment;")) return parsed;
    return {
      ...parsed,
      content: vietnamese ? `Đã xác minh tệp ${label}. [Tải ${label}](${downloadUrl})` : `Verified ${selection || provided ? "the requested" : "the current workspace"} ${label} file. [Download ${label}](${downloadUrl})`, // vi-allow: Vietnamese authenticated export confirmation.
      verifiedReadOnlyResult: true,
      appliedSummaries: [], focusBlockIds: [], unresolvedSummaries: [],
      suggestions: { grounded: [], expand: [] },
    };
  } catch { return parsed; }
}
