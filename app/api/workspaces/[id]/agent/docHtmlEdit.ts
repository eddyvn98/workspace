import { attrValue, decodeText, encodeText, nodeText, parseHtml, walkNodes, type HtmlNode } from "./docHtmlParse";

export interface DocMarks { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean; link?: string }
export interface SpliceOptions { mode: "append" | "prepend" | "replace"; afterHeading?: string; lineId?: string }

const TAG_SPLIT = /(<(?:"[^"]*"|'[^']*'|[^'">])*>)/;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Only http, https and mailto links may be applied as a mark. */
export function safeMarkLink(value: unknown): string | undefined {
  const url = typeof value === "string" ? value.trim() : "";
  return /^(https?:|mailto:)/i.test(url) && !/[\u0000-\u001f\u007f\s]/.test(url) ? url : undefined;
}

export function normalizeMarks(value: Record<string, any>): DocMarks {
  const link = value.link && typeof value.link === "object" ? value.link.url ?? value.link.href : value.link;
  return {
    bold: value.bold === true, italic: value.italic === true, underline: value.underline === true,
    strike: value.strike === true || value.strikethrough === true, code: value.code === true,
    link: safeMarkLink(link),
  };
}

export function hasMarks(marks: DocMarks): boolean {
  return Boolean(marks.bold || marks.italic || marks.underline || marks.strike || marks.code || marks.link);
}

function wrapMarks(textHtml: string, marks: DocMarks): string {
  let out = textHtml;
  if (marks.code) out = `<code>${out}</code>`;
  if (marks.strike) out = `<s>${out}</s>`;
  if (marks.underline) out = `<u>${out}</u>`;
  if (marks.italic) out = `<em>${out}</em>`;
  if (marks.bold) out = `<strong>${out}</strong>`;
  if (marks.link) out = `<a href="${escapeAttr(marks.link)}">${out}</a>`;
  return out;
}

/** Replaces and/or marks `query` inside text nodes only; tags and attributes are never touched. */
export function editDocText(html: string, query: string, options: { replacement?: string; marks?: DocMarks; all: boolean }): string {
  if (!query) return html;
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const marks = options.marks ?? {};
  let done = false;
  return html.split(TAG_SPLIT).map((part, position) => {
    if (position % 2 === 1 || done || !part) return part;
    const decoded = decodeText(part);
    pattern.lastIndex = 0;
    if (!pattern.test(decoded)) return part;
    let out = "";
    let cursor = 0;
    pattern.lastIndex = 0;
    for (let match = pattern.exec(decoded); match; match = pattern.exec(decoded)) {
      out += encodeText(decoded.slice(cursor, match.index));
      out += wrapMarks(encodeText(options.replacement ?? match[0]), marks);
      cursor = match.index + match[0].length;
      if (!options.all) { done = true; break; }
    }
    return out + encodeText(decoded.slice(cursor));
  }).join("");
}

const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
const headingLevel = (node: HtmlNode) => (/^h([1-6])$/.test(node.tag) ? Number(node.tag[1]) : 0);

function tableNodes(nodes: HtmlNode[], html: string): Array<{ id: string; raw: string }> {
  const found: Array<{ id: string; raw: string }> = [];
  walkNodes(nodes, (node) => {
    const id = node.tag === "div" ? attrValue(node, "data-table-id") : undefined;
    if (id !== undefined && / data-workspace-table/.test(` ${node.attrs}`)) found.push({ id, raw: html.slice(node.start, node.end) });
  });
  return found;
}

/** Embedded table nodes inside a replaced range survive unless the new content re-embeds them. */
export function withKeptTables(removed: string, added: string): string {
  const kept = tableNodes(parseHtml(removed), removed).filter((table) => !added.includes(`data-table-id="${table.id}"`));
  return added + kept.map((table) => table.raw).join("");
}

function dropLeadingHeading(added: string, heading: string): string {
  const [first] = parseHtml(added);
  return first && headingLevel(first) && norm(nodeText(first)) === norm(heading) ? added.slice(first.end) : added;
}

function adaptForListItem(added: string, target: HtmlNode): string {
  const taskItem = attrValue(target, "data-type") === "taskItem";
  const blocks = parseHtml(added).filter((node) => node.tag !== "#text" || node.text?.trim());
  const list = blocks.length === 1 && (blocks[0].tag === "ul" || blocks[0].tag === "ol") ? blocks[0] : undefined;
  let items = list ? added.slice(list.innerStart, list.innerEnd)
    : `<li><p>${blocks.map((node) => (node.tag === "#text" ? encodeText(decodeText(node.text ?? "")) : added.slice(node.innerStart, node.innerEnd))).join(" ")}</p></li>`;
  items = taskItem
    ? items.replace(/<li(?![^>]*data-type)(?=[\s>])/g, '<li data-type="taskItem" data-checked="false"')
    : items.replace(/(<li[^>]*?)\s+data-type="taskItem"/g, "$1").replace(/(<li[^>]*?)\s+data-checked="(?:true|false)"/g, "$1");
  return items;
}

function preserveReplacedLine(content: string, target: HtmlNode): string {
  const nodes = parseHtml(content).filter((node) => node.tag !== '#text' || node.text?.trim());
  const lineId = attrValue(target, 'data-line-id');
  if (!lineId || nodes.length !== 1) return content;
  const replacement = nodes[0];
  if (!['p', 'h1', 'h2', 'h3', 'li', 'blockquote'].includes(replacement.tag)) return content;
  // A plain-language rewrite of a heading keeps its type and alignment. Explicit headings still change type.
  if (replacement.tag === 'p' && /^h[1-3]$/.test(target.tag)) {
    return `<${target.tag}${target.attrs}>${content.slice(replacement.innerStart, replacement.innerEnd)}</${target.tag}>`;
  }
  return content.replace(new RegExp(`^\\s*<${replacement.tag}([^>]*)>`), (_whole, attrs: string) =>
    `<${replacement.tag}${attrs.replace(/\s+data-line-id=(?:"[^"]*"|'[^']*')/g, '')} data-line-id="${escapeAttr(lineId)}">`);
}

/**
 * Applies new doc html to stored html without resending the document.
 * Returns null when the heading or lineId anchor cannot be found.
 */
export function spliceDocHtml(html: string, added: string, options: SpliceOptions): string | null {
  const { mode } = options;
  const nodes = parseHtml(html);
  if (options.lineId) {
    const found: HtmlNode[] = [];
    walkNodes(nodes, (node) => { if (attrValue(node, "data-line-id") === options.lineId) { found.push(node); return true; } });
    const target = found[0];
    if (!target) return null;
    let content = target.tag === "li" ? adaptForListItem(added, target) : added;
    if (mode === 'replace') content = preserveReplacedLine(content, target);
    if (mode === "prepend") return html.slice(0, target.start) + content + html.slice(target.start);
    if (mode === "append") return html.slice(0, target.end) + content + html.slice(target.end);
    return html.slice(0, target.start) + withKeptTables(html.slice(target.start, target.end), content) + html.slice(target.end);
  }
  if (options.afterHeading) {
    const wanted = norm(options.afterHeading);
    const headings = nodes.filter((node) => headingLevel(node) > 0);
    const heading = headings.find((node) => norm(nodeText(node)) === wanted) ?? headings.find((node) => norm(nodeText(node)).includes(wanted));
    if (!heading) return null;
    const next = nodes.find((node) => node.start >= heading.end && headingLevel(node) > 0 && headingLevel(node) <= headingLevel(heading));
    const from = heading.end;
    const to = next ? next.start : html.length;
    const content = dropLeadingHeading(added, nodeText(heading));
    if (mode === "prepend") return html.slice(0, from) + content + html.slice(from);
    if (mode === "append") return html.slice(0, to) + content + html.slice(to);
    return html.slice(0, from) + withKeptTables(html.slice(from, to), content) + html.slice(to);
  }
  if (mode === "append") return html + added;
  if (mode === "prepend") return added + html;
  return added;
}

export function embedNodeHtml(tableId: string): string {
  return `<div data-workspace-table="true" data-table-id="${escapeAttr(tableId)}"></div>`;
}

export function docHasTable(html: string, tableId: string): boolean {
  return tableNodes(parseHtml(html), html).some((table) => table.id === tableId);
}

