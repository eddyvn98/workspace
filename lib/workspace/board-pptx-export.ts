import { readKnowledgeImage } from "@/lib/project-knowledge-storage";
import { exportBoardPptx, PPTX_MIME } from "./pptx-export";
import { exportBoardPdf } from "./pdf-export";

let activeExports = 0;

export async function createBoardSlideExport(board: { title: string; blocks: unknown; blockOrder: unknown }, blockIds: unknown, format: "pptx" | "pdf") {
  if (activeExports >= 2) return { ok: false as const, status: 429, reason: "export_busy", error: "Slide exports are busy. Please retry shortly." };
  activeExports++;
  try {
    const result = await (format === "pdf" ? exportBoardPdf : exportBoardPptx)(board, blockIds, readKnowledgeImage);
    return { ok: true as const, ...result, mimeType: format === "pdf" ? "application/pdf" : PPTX_MIME };
  } catch (error) {
    return { ok: false as const, status: 422, reason: "slide_export_failed", error: error instanceof Error ? error.message : "Unable to export the slides." };
  } finally { activeExports--; }
}
