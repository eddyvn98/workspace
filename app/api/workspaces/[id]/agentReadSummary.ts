import { asBlockRecord } from "../_edit-events";
import { docHtmlLines, docHtmlToText } from "./agent/docHtmlText";
import { compactSlideDeck } from "./agentSlideSummary";
import { buildTableMeta } from "@/app/workspace/utils/tableMeta";

const DOC_SUMMARY_CHARS = 4000;

/** Readable doc content for the agent: markdown-ish text plus addressable lineIds. */
export function docReadFields(html: string, limit = Infinity): Record<string, unknown> {
  const full = docHtmlToText(html);
  const lines = docHtmlLines(html);
  return {
    docText: full.length > limit ? full.slice(0, limit) : full,
    ...(full.length > limit ? { docTextTruncated: true, docTextLength: full.length } : {}),
    ...(lines.length ? { docLines: Number.isFinite(limit) ? lines.slice(0, 60) : lines } : {}),
  };
}

/** view=full: attach the doc text next to the raw html so the agent does not parse html. */
export function addDocTextToBlocks(value: unknown): unknown {
  const withText = (block: unknown) => {
    const item = block && typeof block === "object" ? block as Record<string, unknown> : null;
    const data = item?.data && typeof item.data === "object" ? item.data as Record<string, unknown> : null;
    return item?.type === "doc" && typeof data?.html === "string" ? { ...item, data: { ...data, ...docReadFields(data.html) } } : block;
  };
  if (Array.isArray(value)) return value.map(withText);
  return Object.fromEntries(Object.entries(asBlockRecord(value)).map(([id, block]) => [id, withText(block)]));
}

export function compactAgentBlock(id: string, value: Record<string, unknown>, kind: "block" | "connector", options: { fullSlideIds?: ReadonlySet<string> } = {}) {
  const connectorKeys = ["id", "fromBlockId", "toBlockId", "label", "lineType", "strokeColor", "strokeWidth", "dashed", "arrowStart", "arrowEnd"];
  if (kind === "connector") {
    return Object.fromEntries(connectorKeys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
  }
  const data = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown>
    : {};
  const styleValue = value.style ?? data.style;
  const style = styleValue && typeof styleValue === "object" && !Array.isArray(styleValue)
    ? styleValue as Record<string, unknown> : {};
  const transformValue = value.transform && typeof value.transform === "object" && !Array.isArray(value.transform)
    ? value.transform as Record<string, unknown>
    : {};
  const transform = transformValue.override && typeof transformValue.override === "object"
    ? transformValue.override as Record<string, unknown>
    : transformValue;
  const summaryValue = [data.label, data.title, data.markdown, data.text, data.description]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);
  const summary = summaryValue?.replace(/\s+/g, " ").trim().slice(0, 180);
  const styleKeys = [
    "backgroundColor", "textColor", "borderColor", "borderWidth", "fontSize",
    "fontWeight", "fontStyle", "fontUnderline", "align", "opacity", "shapeKind",
    "fillColor", "strokeColor", "strokeWidth",
  ];
  const transformKeys = ["x", "y", "w", "h", "rotation", "zIndex"];
  const compactData: Record<string, unknown> = {};
  if (Array.isArray(data.frameBlockIds)) compactData.frameBlockIds = data.frameBlockIds;
  if (typeof data.frameAutoMembership === "boolean") compactData.frameAutoMembership = data.frameAutoMembership;
  for (const key of ["label", "title", "markdown", "text", "description", "shapeKind", "kind"]) {
    if (typeof data[key] === "string") compactData[key] = ["label", "title", "markdown", "text"].includes(key) ? summary : data[key];
  }
  if (summary) compactData.summary = summary;
  if (Array.isArray(data.cells)) {
    compactData.tableSummary = {
      rowCount: data.cells.length,
      columnCount: data.cells.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0),
    };
  }
  if (value.type === "table") {
    compactData.tableMeta = buildTableMeta(data);
    compactData.activeSheetId = data.activeSheetId ?? value.id ?? id;
    compactData.sheets = Array.isArray(data.sheets) && data.sheets.length ? data.sheets.map((sheet) => {
      const item = sheet && typeof sheet === "object" ? sheet as Record<string, unknown> : {};
      const sheetData = item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {};
      return { id: item.id, name: item.name, rows: sheetData.rows, cols: sheetData.cols };
    }) : [{ id: value.id ?? id, name: "Sheet1", rows: data.rows, cols: data.cols }];
  }
  if (value.type === "slideDeck") Object.assign(compactData, compactSlideDeck(data, options));
  if (value.type === "doc" && typeof data.html === "string") Object.assign(compactData, docReadFields(data.html, DOC_SUMMARY_CHARS));
  if (Array.isArray(data.points)) compactData.pointCount = data.points.length;

  return {
    id: typeof value.id === "string" ? value.id : id,
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(typeof value.parentId === "string" ? { parentId: value.parentId } : {}),
    ...(typeof value.embeddedInDocId === "string" ? { embeddedInDocId: value.embeddedInDocId } : {}),
    data: compactData,
    style: Object.fromEntries(styleKeys.filter((key) => style[key] !== undefined).map((key) => [key, style[key]])),
    transform: Object.fromEntries(transformKeys.filter((key) => typeof transform[key] === "number").map((key) => [key, transform[key]])),
  };
}

export function compactAgentRecord(value: unknown, kind: "block" | "connector", options: { fullSlideIds?: ReadonlySet<string> } = {}) {
  const entries: Array<[string, Record<string, unknown>]> = Array.isArray(value)
    ? value.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return [String(record.id ?? index), record];
    })
    : Object.entries(asBlockRecord(value));
  const compactEntries = entries.map(([id, item]) => [id, compactAgentBlock(id, item, kind, options)] as const);
  return Array.isArray(value) ? compactEntries.map(([, item]) => item) : Object.fromEntries(compactEntries);
}
