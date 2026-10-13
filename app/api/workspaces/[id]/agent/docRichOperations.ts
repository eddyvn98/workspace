import { sanitizeAgentHtml } from "./agentHtmlSanitize";
import { looksLikeHtml, markdownToDocHtml } from "./agentMarkdownToHtml";
import { docHasTable, editDocText, embedNodeHtml, hasMarks, normalizeMarks, spliceDocHtml, type SpliceOptions, withKeptTables } from "./docHtmlEdit";
import { param, record, targetIds, text, type JsonMap } from "./paritySelectionOperations";
import type { AgentBoardState } from "./operations";

/** Markdown or html content for a doc block, sanitized (text-align is the only style kept). */
export function docContentHtml(content: string): string {
  return sanitizeAgentHtml(looksLikeHtml(content) ? content : markdownToDocHtml(content), { docAlign: true });
}

const isString = (value: unknown): value is string => typeof value === "string";

function spliceOptions(raw: JsonMap, richText: JsonMap = {}): SpliceOptions {
  const afterHeading = text(param(raw, "afterHeading") ?? richText.afterHeading);
  const lineId = text(param(raw, "lineId") ?? richText.lineId);
  const requested = text(param(raw, "mode") ?? richText.mode)?.toLowerCase();
  const mode = requested === "append" || requested === "prepend" || requested === "replace" ? requested : afterHeading || lineId ? "append" : "replace";
  return { mode, afterHeading, lineId };
}

function writeDocHtml(block: JsonMap, content: string, options: SpliceOptions): boolean {
  const data = record(block.data);
  const source = String(data.html ?? "");
  const added = docContentHtml(content);
  // A whole-document rewrite keeps embedded tables unless the new content re-embeds them.
  const next = options.mode === "replace" && !options.afterHeading && !options.lineId ? withKeptTables(source, added) : spliceDocHtml(source, added, options);
  if (next === null || next === source) return false;
  block.data = { ...data, html: next };
  block.updatedAt = Date.now();
  return true;
}

function richContentSource(raw: JsonMap, state: AgentBoardState): string | undefined {
  const html = [param(raw, "html"), param(raw, "contentHtml"), param(raw, "labelHtml")].find(isString);
  if (html !== undefined) return html;
  const ids = targetIds(raw, state);
  const docOnly = ids.some((id) => state.blocks[id]?.type === "doc");
  if (docOnly && isString(param(raw, "markdown"))) return param(raw, "markdown") as string;
  return isString(param(raw, "text")) ? param(raw, "text") as string : undefined;
}

export function updateRichContent(state: AgentBoardState, raw: JsonMap): string[] {
  const content = richContentSource(raw, state);
  if (content === undefined) return [];
  const options = spliceOptions(raw);
  const changed: string[] = [];
  for (const blockId of targetIds(raw, state)) {
    const block = state.blocks[blockId];
    if (!block || (block.type !== "doc" && block.type !== "shape")) continue;
    if (block.type === "doc") {
      if (writeDocHtml(block, content, options)) changed.push(blockId);
      continue;
    }
    const data = record(block.data);
    if (data.label === content) continue;
    block.data = { ...data, label: content };
    block.updatedAt = Date.now();
    changed.push(blockId);
  }
  return changed;
}

export function hasRichContentInput(state: AgentBoardState, raw: JsonMap): boolean {
  if ([param(raw, "html"), param(raw, "contentHtml"), param(raw, "labelHtml")].some(isString)) return true;
  const targets = targetIds(raw, state).map((id) => String(state.blocks[id]?.type));
  if (isString(param(raw, "markdown")) && targets.includes("doc")) return true;
  return isString(param(raw, "text")) && targets.some((type) => type === "doc" || type === "shape");
}

export function updateStructuredRichText(state: AgentBoardState, raw: JsonMap): string[] {
  const richText = record(param(raw, "richText"));
  const query = text(param(raw, "query")) ?? text(richText.text);
  const explicit = [param(raw, "html") ?? richText.html, param(raw, "markdown") ?? richText.markdown, param(raw, "content") ?? richText.content].find(isString);
  const marks = normalizeMarks(record(param(raw, "marks") ?? richText.marks));
  const replacement = isString(param(raw, "replacement")) ? param(raw, "replacement") as string : undefined;
  const all = param(raw, "replaceAll") !== false;
  const options = spliceOptions(raw, richText);
  const changed: string[] = [];
  for (const blockId of targetIds(raw, state)) {
    const block = state.blocks[blockId];
    if (!block || (block.type !== "doc" && block.type !== "shape")) continue;
    const data = record(block.data);
    const key = block.type === "doc" ? "html" : "label";
    if (explicit !== undefined) {
      if (block.type === "doc") { if (writeDocHtml(block, explicit, options)) changed.push(blockId); continue; }
    }
    const source = String(data[key] ?? "");
    const next = explicit !== undefined ? explicit
      : query && (hasMarks(marks) || replacement !== undefined) ? editDocText(source, query, { replacement, marks, all }) : source;
    if (next === source) continue;
    block.data = { ...data, [key]: next };
    block.updatedAt = Date.now();
    changed.push(blockId);
  }
  return changed;
}

/** embed_table_in_doc: sets embeddedInDocId on the table and places its node in the doc, as the UI does. */
export function embedTableInDoc(state: AgentBoardState, raw: JsonMap): string[] {
  const docId = text(param(raw, "docId")) ?? targetIds(raw, state)[0];
  const tableId = text(param(raw, "tableId"));
  const doc = docId ? state.blocks[docId] : undefined;
  const table = tableId ? state.blocks[tableId] : undefined;
  if (!docId || !tableId || !doc || doc.type !== "doc" || !table || table.type !== "table") return [];
  if (table.embeddedInDocId && table.embeddedInDocId !== docId) return [];
  const data = record(doc.data);
  const source = String(data.html ?? "");
  const afterHeading = text(param(raw, "afterHeading"));
  const next = docHasTable(source, tableId) ? source : spliceDocHtml(source, embedNodeHtml(tableId), { mode: "append", afterHeading });
  if (next === null) return [];
  if (next === source && table.embeddedInDocId === docId) return [];
  table.embeddedInDocId = docId;
  table.updatedAt = Date.now();
  doc.data = { ...data, html: next };
  doc.updatedAt = Date.now();
  return [docId, tableId];
}
