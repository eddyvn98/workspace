import JSZip from "jszip";
import { spawn } from "child_process";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { createImageDescriber, extractPptxText, type ExtractOptions } from "./extract-office-images";

export type { ExtractOptions } from "./extract-office-images";

// Applied per logical section (a sheet, a zip entry) rather than to the
// whole file — a 19-sheet workbook used to be joined into one string and
// truncated here, silently dropping every sheet past the cap.
const MAX_SECTION_LENGTH = 200_000;

export type KnowledgeFileType = "text" | "image";

export interface KnowledgeSection {
  name: string;
  text: string;
}

export interface ExtractResult {
  text: string;
  fileType: KnowledgeFileType;
  // Present for multi-part formats (xlsx sheets, zip entries) so each part
  // can be stored/indexed as its own retrievable chunk instead of one giant
  // blob. Absent (single implicit chunk) for everything else.
  sections?: KnowledgeSection[];
}

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/x-markdown",
]);

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

function tableToText(tableHtml: string): string {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, rowHtml]) => {
    const cells: string[] = [];
    for (const [, attrs, cellHtml] of rowHtml.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      const colspan = parseInt(attrs.match(/colspan="(\d+)"/i)?.[1] ?? "1", 10);
      const text = stripTags(cellHtml);
      for (let i = 0; i < colspan; i++) cells.push(text);
    }
    return cells;
  });
  return rows
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => cells.join(" | "))
    .join("\n");
}

function blockHtmlToText(html: string): string {
  return stripTags(html.replace(/<\/(p|h[1-6]|li|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n"));
}

// mammoth emits <table> blocks for Word tables; extracting them separately
// keeps column/row alignment (and merged-header colspans) instead of
// flattening every cell into one run-on paragraph.
function htmlToStructuredText(html: string): string {
  // Embedded pictures are replaced by their caption (set as alt text) so the
  // text inside them survives the tag stripping below.
  html = html.replace(/<img[^>]*?alt="([^"]*)"[^>]*>/gi, "\n$1\n");
  let result = "";
  let cursor = 0;
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(html)) !== null) {
    result += blockHtmlToText(html.slice(cursor, match.index));
    result += `\n${tableToText(match[1])}\n`;
    cursor = tableRegex.lastIndex;
  }
  result += blockHtmlToText(html.slice(cursor));
  return result.trim();
}

// PPTX has no lightweight JS parser in this repo, so it's converted via
// Microsoft's markitdown CLI. A temp file (not stdin) is required — pptx/zip
// formats need to seek the central directory, which a pipe can't do.
// Set MARKITDOWN_PYTHON_BIN if the python binary on PATH isn't the one with
// markitdown installed (differs across dev machines).
async function runMarkItDown(buffer: Buffer, ext: string): Promise<string> {
  const pythonBin = process.env.MARKITDOWN_PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const tmpPath = path.join(os.tmpdir(), `markitdown-${randomUUID()}${ext}`);
  await fsp.writeFile(tmpPath, buffer);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(pythonBin, ["-m", "markitdown", tmpPath], { windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`markitdown exited ${code}: ${stderr.trim()}`));
      });
    });
  } finally {
    await fsp.unlink(tmpPath).catch(() => {});
  }
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const mime = mimeType.toLowerCase().trim();

  if (IMAGE_MIME_TYPES.has(mime)) {
    return { text: "", fileType: "image" };
  }

  let text = "";
  let sections: KnowledgeSection[] | undefined;

  if (TEXT_MIME_TYPES.has(mime) || filename.match(/\.(txt|md|csv|json)$/i)) {
    text = buffer.toString("utf-8");
  } else if (filename.match(/\.(dxf|ifc)$/i)) {
    // Both DXF and IFC (STEP-based) are plain-text formats — readable as-is
    // for a raw-text RAG fallback. The original bytes are preserved
    // separately (saveKnowledgeOriginal) so the project agent can parse the
    // real structure with dxf_tools.py / ifc_tools.py instead of relying on
    // this raw dump.
    text = buffer.toString("utf-8");
  } else if (mime === "application/pdf" || filename.endsWith(".pdf")) {
    // Loaded on demand: pdf-parse pulls in a native canvas binding, and a
    // load failure at module scope used to take down every route importing
    // this file (including plain text/Markdown uploads) with an HTML 500.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    filename.match(/\.docx?$/i)
  ) {
    const mammoth = await import("mammoth");
    const describe = createImageDescriber(options);
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const bytes = Buffer.from(await image.read());
          const caption = await describe(bytes, image.contentType, "docx-image");
          return { src: "", alt: caption ? `[Image: ${caption}]` : "" };
        }),
      },
    );
    text = htmlToStructuredText(result.value);
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    filename.match(/\.xlsx?$/i)
  ) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    // One section per sheet — a workbook with many sheets used to be joined
    // into a single string and truncated below, silently dropping sheets
    // past the cap. Each sheet is now its own chunk (and its own vector
    // embedding downstream), each capped independently instead.
    sections = workbook.SheetNames.map((sheetName) => ({
      name: sheetName,
      text: XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]).slice(0, MAX_SECTION_LENGTH),
    }));
    text = sections.map((s) => `[Sheet: ${s.name}]\n${s.text}`).join("\n\n");
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    filename.match(/\.pptx?$/i)
  ) {
    // .pptx is parsed in-process; only the legacy binary .ppt needs markitdown.
    text = filename.match(/\.ppt$/i) || mime === "application/vnd.ms-powerpoint"
      ? await runMarkItDown(buffer, ".ppt")
      : await extractPptxText(buffer, options);
  } else if (
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    filename.endsWith(".zip")
  ) {
    const zip = await JSZip.loadAsync(buffer);
    sections = [];
    for (const [entryName, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const entryBuffer = await entry.async("nodebuffer");
      try {
        const result = await extractTextFromBuffer(entryBuffer, "", entryName, options);
        if (result.text) sections.push({ name: entryName, text: result.text.slice(0, MAX_SECTION_LENGTH) });
      } catch {
        // skip entries we can't parse (unsupported type, corrupt data, etc.)
      }
    }
    text = sections.map((s) => `[File: ${s.name}]\n${s.text}`).join("\n\n");
  } else {
    throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), {
      code: "UNSUPPORTED_TYPE",
    });
  }

  return {
    text: sections ? text : text.slice(0, MAX_SECTION_LENGTH),
    fileType: "text",
    sections,
  };
}
