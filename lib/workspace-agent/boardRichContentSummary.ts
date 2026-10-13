import { attrValue, nodeText, parseHtml, walkNodes } from "@/app/api/workspaces/[id]/agent/docHtmlParse";
import type { WorkspaceJson } from "./contracts";

const MAX_HTML = 20000;
const MAX_TEXT = 1200;

export function summarizeRuntimeDoc(data: WorkspaceJson): WorkspaceJson {
  const html = typeof data.html === "string" ? data.html : "";
  try {
    const nodes = parseHtml(html.slice(0, MAX_HTML));
    const fullText = nodes.map(nodeText).join("\n").trim();
    const docLines: WorkspaceJson[] = [];
    const ids = new Set<string>();
    walkNodes(nodes, (node) => {
      const lineId = attrValue(node, "data-line-id");
      if (!lineId || lineId.length > 128 || ids.has(lineId) || docLines.length >= 24) return;
      ids.add(lineId);
      docLines.push({ lineId, text: nodeText(node).slice(0, 180) });
    });
    return { docText: fullText.slice(0, MAX_TEXT), docTextTruncated: html.length > MAX_HTML || fullText.length > MAX_TEXT, docLines };
  } catch {
    return { docText: "", docTextTruncated: true, docReadError: "Stored document HTML could not be read." };
  }
}
