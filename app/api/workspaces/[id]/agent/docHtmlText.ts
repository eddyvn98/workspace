import { attrValue, decodeText, parseHtml, walkNodes, type HtmlNode } from "./docHtmlParse";

export interface DocLine { lineId: string; type: string; text: string }

function inline(nodes: HtmlNode[]): string {
  return nodes.map((node) => {
    if (node.tag === "#text") return decodeText(node.text ?? "").replace(/\s+/g, " ");
    const inner = inline(node.children);
    if (node.tag === "br") return "\n";
    if (node.tag === "strong" || node.tag === "b") return `**${inner}**`;
    if (node.tag === "em" || node.tag === "i") return `*${inner}*`;
    if (node.tag === "s" || node.tag === "del") return `~~${inner}~~`;
    if (node.tag === "code") return `\`${inner}\``;
    if (node.tag === "a") return `[${inner}](${attrValue(node, "href") ?? ""})`;
    if (node.tag === "img") return `![${attrValue(node, "alt") ?? ""}](${attrValue(node, "src") ?? ""})`;
    return inner;
  }).join("");
}

const isList = (node: HtmlNode) => node.tag === "ul" || node.tag === "ol";
const rawText = (node: HtmlNode): string => (node.tag === "#text" ? decodeText(node.text ?? "") : node.tag === "br" ? "\n" : node.children.map(rawText).join(""));

function listLines(list: HtmlNode, depth: number): string[] {
  const lines: string[] = [];
  let number = Number(attrValue(list, "start") ?? 1);
  for (const item of list.children.filter((child) => child.tag === "li")) {
    const task = attrValue(item, "data-type") === "taskItem";
    const marker = task ? `- [${attrValue(item, "data-checked") === "true" ? "x" : " "}]` : list.tag === "ol" ? `${number}.` : "-";
    number += 1;
    const own = item.children.filter((child) => !isList(child));
    lines.push(`${"  ".repeat(depth)}${marker} ${own.map((child) => inline(child.tag === "p" ? child.children : [child])).join(" ").trim()}`);
    item.children.filter(isList).forEach((nested) => lines.push(...listLines(nested, depth + 1)));
  }
  return lines;
}

function tableLines(table: HtmlNode): string[] {
  const rows: HtmlNode[] = [];
  walkNodes([table], (node) => { if (node.tag === "tr") rows.push(node); });
  const lines = rows.map((row) => `| ${row.children.filter((cell) => cell.tag === "td" || cell.tag === "th").map((cell) => inline(cell.children).replace(/\|/g, "\\|").trim()).join(" | ")} |`);
  if (lines.length > 1) lines.splice(1, 0, `| ${rows[0].children.filter((cell) => cell.tag === "td" || cell.tag === "th").map(() => "---").join(" | ")} |`);
  return lines;
}

function blockLines(nodes: HtmlNode[]): string[] {
  const blocks: string[] = [];
  for (const node of nodes) {
    if (node.tag === "#text") { if (decodeText(node.text ?? "").trim()) blocks.push(inline([node]).trim()); continue; }
    if (/^h[1-6]$/.test(node.tag)) blocks.push(`${"#".repeat(Math.min(3, Number(node.tag[1])))} ${inline(node.children).trim()}`);
    else if (isList(node)) blocks.push(listLines(node, 0).join("\n"));
    else if (node.tag === "blockquote") blocks.push(blockLines(node.children).join("\n\n").split("\n").map((line) => `> ${line}`.trimEnd()).join("\n"));
    else if (node.tag === "pre") blocks.push(`\`\`\`\n${rawText(node).replace(/\n$/, "")}\n\`\`\``);
    else if (node.tag === "table") blocks.push(tableLines(node).join("\n"));
    else if (node.tag === "hr") blocks.push("---");
    else if (node.tag === "div" && node.attrs.includes("data-workspace-table")) blocks.push(`[embedded table: ${attrValue(node, "data-table-id") ?? ""}]`);
    else if (node.tag === "img") blocks.push(inline([node]));
    else if (node.tag === "div" || node.tag === "span") blocks.push(...blockLines(node.children));
    else blocks.push(inline(node.children).trim());
  }
  return blocks.filter((block) => block.length > 0);
}

/** Markdown-ish plain text of a doc's stored html (headings, lists, checkboxes, tables). */
export function docHtmlToText(html: string): string {
  return blockLines(parseHtml(html)).join("\n\n");
}

/** Addressable lines (data-line-id) so the agent can anchor partial edits. */
export function docHtmlLines(html: string, previewLength = 80): DocLine[] {
  const lines: DocLine[] = [];
  walkNodes(parseHtml(html), (node, parent) => {
    const lineId = attrValue(node, "data-line-id");
    if (!lineId || (node.tag === "p" && parent && (parent.tag === "li" || parent.tag === "blockquote"))) return;
    const type = attrValue(node, "data-type") === "taskItem" ? "taskItem" : node.tag;
    lines.push({ lineId, type, text: rawText(node).replace(/\s+/g, " ").trim().slice(0, previewLength).trim() });
  });
  return lines;
}
