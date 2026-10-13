import { sanitizeDeckSlides } from "./agentHtmlSanitize";
import { docDefaultSize } from "./agentMarkdownToHtml";
import { docContentHtml, embedTableInDoc, hasRichContentInput, updateRichContent, updateStructuredRichText } from "./docRichOperations";
import type { AgentBoardState } from "./operations";
import { blockRect, freePosition, rectanglesOverlap } from "./operationsCore";
import { shapeAction } from "./operationsShapeActions";
import { fitTableContent } from "@/app/workspace/utils/tableAutoFit";
import { normalizeWorkspaceTextDataStyle, normalizeWorkspaceVisualStyle } from "@/app/workspace/utils/workspaceChatTextStyle";
import {
  arrangeSelection,
  searchReplace,
  type AgentResult,
  type JsonMap,
  number,
  param,
  record,
  targetIds,
  text,
  transform,
  updateZOrder,
} from "./paritySelectionOperations";

function nextPosition(state: AgentBoardState, raw: JsonMap, width: number, height: number): { x: number; y: number } {
  const source = record(param(raw, "transform"));
  const x = number(source.x) ?? number(param(raw, "x")) ?? 80;
  const y = number(source.y) ?? number(param(raw, "y")) ?? 80;
  // Same rectangle-overlap rule as every other agent-created block; an exact
  // x:y match check let a new block land partly on top of an existing one.
  return freePosition(state, { x, y }, width, height);
}

function tableCellText(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const cell = value as JsonMap;
    return tableCellText(cell.value ?? cell.text ?? cell.content);
  }
  return value === null || value === undefined ? "" : String(value);
}

export function normalizeCreatedTableCells(value: unknown, rows: number, cols: number): string[][] {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  if (!Array.isArray(value)) return cells;

  if (value.some(Array.isArray)) {
    value.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || rowIndex >= rows) return;
      row.forEach((cell, columnIndex) => {
        if (columnIndex < cols) cells[rowIndex][columnIndex] = tableCellText(cell);
      });
    });
    return cells;
  }

  value.forEach((cell) => {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) return;
    const entry = cell as JsonMap;
    const row = number(entry.row);
    const column = number(entry.column);
    if (row === undefined || column === undefined || !Number.isInteger(row) || !Number.isInteger(column)) return;
    if (row >= 0 && row < rows && column >= 0 && column < cols) {
      cells[row][column] = tableCellText(entry.value ?? entry.text ?? entry.content);
    }
  });
  return cells;
}

export function normalizeCreatedTableDimensions(rowsValue: unknown, colsValue: unknown): { rows: number; cols: number } {
  const dimension = (value: unknown, fallback: number) => {
    const parsed = number(value) ?? fallback;
    return Math.max(1, Math.min(20, Math.floor(parsed)));
  };
  return { rows: dimension(rowsValue, 3), cols: dimension(colsValue, 3) };
}

function createBlock(state: AgentBoardState, raw: JsonMap): string[] {
  const draft = record(raw.block);
  const type = text(param(raw, "blockType")) ?? text(draft.type);
  const source0 = record(raw.data ?? draft.data);
  const shapeHint = text(draft.shapeKind) ?? text(draft.shapeType) ?? text(source0.shapeKind) ?? text(param(raw, "shapeType"));
  const wantsSticky = [type, shapeHint].some((value) => value !== undefined && /sticky|note/i.test(value));
  if (type === "shape" || wantsSticky) {
    // Shapes and sticky notes are not "text" blocks: create the real shape so
    // its kind and fill are kept, instead of silently dropping the request.
    const label = text(source0.label) ?? text(source0.markdown) ?? text(draft.text) ?? text(param(raw, "text")) ?? "";
    return shapeAction(state, { ...draft, ...raw, shapeType: wantsSticky ? "sticky_note" : shapeHint ?? "rounded_rect", text: label, style: { ...record(draft.style), ...record(raw.style) } }, "create_shape");
  }
  const supported = new Set(["text", "image", "link", "doc", "table", "slideDeck"]);
  const docHtml = (data: JsonMap, params: JsonMap): string => {
    const html = text(data.html) ?? text(param(params, "html")) ?? text(data.markdown) ?? text(data.text) ?? text(param(params, "markdown")) ?? "";
    return docContentHtml(html);
  };
  if (!type || !supported.has(type)) return [];

  const source = record(raw.data ?? draft.data);
  const { rows, cols } = normalizeCreatedTableDimensions(source.rows, source.cols);
  const tableCells = type === "table"
    ? normalizeCreatedTableCells(source.cells, rows, cols)
    : undefined;
  const tableFit = tableCells ? fitTableContent(tableCells) : undefined;
  const defaultSize: Record<string, [number, number]> = {
    text: [180, 90], image: [240, 160], link: [320, 220], doc: [360, 420],
    table: [240, 140], slideDeck: [480, 360],
  };
  const [defaultWidth, defaultHeight] = type === "doc" ? docDefaultSize(docHtml(source, raw)) : defaultSize[type] ?? [240, 160];
  const width = number(param(raw, "width")) ?? number(param(raw, "w")) ?? tableFit?.width ?? defaultWidth;
  const height = number(param(raw, "height")) ?? number(param(raw, "h")) ?? tableFit?.height ?? defaultHeight;
  const position = nextPosition(state, raw, width, height);
  const createdAt = Date.now();
  const blockId = text(param(raw, "id")) ?? crypto.randomUUID();
  const base: JsonMap = {
    id: blockId,
    type,
    transform: {
      computed: null,
      override: {
        x: position.x,
        y: position.y,
        w: width,
        h: height,
        rotation: number(param(raw, "rotation")) ?? 0,
        zIndex: number(param(raw, "zIndex")) ?? state.blockOrder.length,
      },
    },
    createdAt,
    updatedAt: createdAt,
    ...(text(param(raw, "parentId")) ? { parentId: text(param(raw, "parentId")) } : {}),
  };

  const data = type === "text"
    ? { markdown: text(source.markdown) ?? text(param(raw, "text")) ?? "" }
    : type === "image"
      ? { url: text(source.url) ?? text(param(raw, "url")) ?? "", ...(text(source.alt) ? { alt: text(source.alt) } : {}) }
      : type === "link"
        ? { url: text(source.url) ?? text(param(raw, "url")) ?? "", ...(text(source.title) ? { title: text(source.title) } : {}) }
        : type === "doc"
          ? { html: docHtml(source, raw) }
        : type === "table"
          ? { rows, cols, cells: tableCells, mode: "document" }
          : (() => {
            const slideId = crypto.randomUUID();
            return { slideOrder: [slideId], slides: { [slideId]: { id: slideId, name: "Slide 1", html: "" } }, aspectRatio: "16:9" };
          })();

  if (type === "slideDeck") {
    const slideId = crypto.randomUUID();
    base.data = { slideOrder: [slideId], slides: { [slideId]: { id: slideId, name: "Slide 1", html: "" } }, aspectRatio: "16:9", ...source }; base.data = sanitizeDeckSlides(base.data as JsonMap);
  } else if (type === "table") {
    base.data = {
      ...data,
      ...source,
      rows,
      cols,
      cells: normalizeCreatedTableCells(source.cells, rows, cols),
      mode: text(source.mode) ?? "document",
      headerRow: typeof source.headerRow === "boolean" ? source.headerRow : true,
      autoFitContent: source.autoFitContent !== false,
      rowWeights: Array.isArray(source.rowWeights) ? source.rowWeights : tableFit?.rowWeights,
      colWeights: Array.isArray(source.colWeights) ? source.colWeights : tableFit?.colWeights,
    };
  } else if (type === "doc") {
    const { markdown: _markdown, text: _text, ...rest } = source; base.data = { ...rest, ...data };
  } else {
    base.data = { ...data, ...source };
  }
  const rawStyle = { ...record(draft.style), ...record(param(raw, "style")) };
  base.style = normalizeWorkspaceVisualStyle(rawStyle);
  if (type === "text") Object.assign(base.data as JsonMap, normalizeWorkspaceTextDataStyle(rawStyle));
  state.blocks[blockId] = base;
  state.blockOrder.push(blockId);
  return [blockId];
}

function updateTransform(state: AgentBoardState, raw: JsonMap): string[] {
  const ids = targetIds(raw, state);
  const source = record(param(raw, "transform"));
  const relativeToId = text(param(raw, "relativeToBlockId"));
  const placement = text(param(raw, "placement"))?.toLowerCase();
  const changesGeometry = placement !== undefined || ["x", "y", "w", "width", "h", "height", "rotation"]
    .some((key) => source[key] !== undefined || param(raw, key) !== undefined);
  const reference = relativeToId ? state.blocks[relativeToId] : undefined;
  if (placement) {
    if (!reference || !["left", "right", "above", "below"].includes(placement) || ids.includes(relativeToId!)) return [];
    const gap = Math.max(0, Math.min(500, number(param(raw, "gap")) ?? 64));
    const referenceRect = blockRect(reference);
    const candidates = ids.map((id) => {
      const rect = blockRect(state.blocks[id]);
      const position = placement === "left"
        ? { x: referenceRect.x - rect.w - gap, y: referenceRect.y + (referenceRect.h - rect.h) / 2 }
        : placement === "right"
          ? { x: referenceRect.x + referenceRect.w + gap, y: referenceRect.y + (referenceRect.h - rect.h) / 2 }
          : placement === "above"
            ? { x: referenceRect.x + (referenceRect.w - rect.w) / 2, y: referenceRect.y - rect.h - gap }
            : { x: referenceRect.x + (referenceRect.w - rect.w) / 2, y: referenceRect.y + referenceRect.h + gap };
      let candidate = { ...rect, ...position };
      const step = gap + 32;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const collision = Object.values(state.blocks).some((block) => {
          const blockId = String(block.id);
          return blockId !== id && blockId !== relativeToId && rectanglesOverlap(candidate, blockRect(block));
        });
        if (!collision) break;
        if (placement === "left") candidate.x -= step;
        else if (placement === "right") candidate.x += step;
        else if (placement === "above") candidate.y -= step;
        else candidate.y += step;
      }
      return [id, candidate] as const;
    });
    candidates.forEach(([id, rect]) => {
      const block = state.blocks[id];
      block.transform = { ...record(block.transform), override: { ...blockRect(block), x: rect.x, y: rect.y } };
      block.updatedAt = Date.now();
    });
    clearMovedConnectorBends(state, ids);
    return ids;
  }
  const patch: JsonMap = {};
  const values: Array<[string, string[]]> = [
    ["x", ["x"]], ["y", ["y"]], ["w", ["w", "width"]], ["h", ["h", "height"]],
    ["rotation", ["rotation"]], ["zIndex", ["zIndex"]],
  ];
  for (const [key, aliases] of values) {
    const value = aliases.map((alias) => source[alias] ?? param(raw, alias)).map(number).find((item) => item !== undefined);
    if (value !== undefined) patch[key] = value;
  }
  if (!Object.keys(patch).length) return [];
  for (const id of ids) {
    const block = state.blocks[id];
    const current = transform(block);
    block.transform = { ...record(block.transform), override: { ...current, ...patch } };
    block.updatedAt = Date.now();
  }
  if (changesGeometry) clearMovedConnectorBends(state, ids);
  return ids;
}

function clearMovedConnectorBends(state: AgentBoardState, movedBlockIds: string[]): void {
  const moved = new Set(movedBlockIds);
  Object.values(state.connectors).forEach((connector) => {
    if (moved.has(String(connector.fromBlockId)) || moved.has(String(connector.toBlockId))) {
      delete connector.waypoints;
    }
  });
}

function disconnect(state: AgentBoardState, raw: JsonMap): string[] {
  const connectorId = text(param(raw, "connectorId"));
  const from = text(param(raw, "fromBlockId")) ?? targetIds({ target: param(raw, "from") }, state)[0];
  const to = text(param(raw, "toBlockId")) ?? targetIds({ target: param(raw, "to") }, state)[0];
  const matches = Object.entries(state.connectors).filter(([id, connector]) =>
    connectorId ? id === connectorId : Boolean(from && to && connector.fromBlockId === from && connector.toBlockId === to));
  for (const [id] of matches) delete state.connectors[id];
  return matches.map(([id]) => id);
}

export function applyWorkspaceParityAgentAction(state: AgentBoardState, raw: JsonMap): AgentResult | undefined {
  const type = String(raw.type ?? "").toLowerCase();
  if (type === "rename_board") {
    const title = typeof param(raw, "title") === "string" ? (param(raw, "title") as string).trim() : "";
    if (!title) return { ids: [], operation: type };
    state.title = title;
    return { ids: ["board"], operation: type };
  }
  if (type === "search_replace") return { ids: searchReplace(state, raw), operation: type };
  if (type === "arrange_selection") return { ids: arrangeSelection(state, raw), operation: type };
  if (type === "update_node" && hasRichContentInput(state, raw)) {
    return { ids: updateRichContent(state, raw), operation: type };
  }
  if (type === "update_rich_text") {
    return { ids: updateStructuredRichText(state, raw), operation: type };
  }
  if (type === "embed_table_in_doc") return { ids: embedTableInDoc(state, raw), operation: type };
  if (type === "create_block") return { ids: createBlock(state, raw), operation: type };
  if (type === "update_transform") return { ids: updateTransform(state, raw), operation: type };
  if (type === "update_z_order") return { ids: updateZOrder(state, raw), operation: type };
  if (type === "disconnect_nodes") return { ids: disconnect(state, raw), operation: type };
  return undefined;
}
