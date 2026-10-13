import { validateCollectionTarget } from "./collectionActionValidation";
import type { WorkspaceJson } from "./contracts";
import { validateWorkspaceRuntimeVisualAction, WORKSPACE_RUNTIME_VISUAL_ACTION_SCHEMAS } from "./visualActionSchema";
import { WORKSPACE_COMMAND_NAMES } from "@/lib/workspace-command-registry";
import { validateRuntimeRichContentAction, validateRuntimeRichContentTarget, WORKSPACE_RUNTIME_RICH_CONTENT_ACTION_SCHEMAS } from "./richContentActionSchema";
import { WORKSPACE_RUNTIME_EXTENDED_ACTION_SCHEMAS } from "./extendedActionSchemas";
import { IMAGE_FLOW_ACTION_SCHEMAS } from "./imageFlowActionSchema";
import { validateWorkspaceActionSemantics } from "./actionSemanticValidation";

export interface PropertySchema {
  type: string;
  nullable?: boolean;
  const?: unknown;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  required?: readonly string[];
  additionalProperties?: boolean;
  pattern?: string;
  properties?: Record<string, PropertySchema>;
  items?: PropertySchema;
  [key: string]: unknown;
}

export interface RuntimeActionSchema {
  type: string;
  additionalProperties?: boolean;
  required: readonly string[];
  properties: Record<string, PropertySchema>;
  anyOf?: readonly { required: readonly string[] }[];
}

const STYLE_PROPERTIES: Record<string, PropertySchema> = {
  isLocked: { type: "boolean" },
  backgroundColor: { type: "string", maxLength: 64 },
  backgroundOpacity: { type: "number", minimum: 0, maximum: 100 },
  borderColor: { type: "string", maxLength: 64 },
  borderWidth: { type: "number", enum: [1, 1.5, 2, 3] },
  borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
  textColor: { type: "string", maxLength: 64 },
  shapeKind: { type: "string", enum: ["rectangle", "rounded", "rounded_rect", "box", "ellipse", "oval", "circle", "diamond", "triangle", "hexagon", "star", "pill", "parallelogram"] },
  flipH: { type: "boolean" },
  flipV: { type: "boolean" },
  fontSize: { type: "number", minimum: 8, maximum: 96 },
  padding: { type: "number", minimum: 0, maximum: 100 },
  textPadding: { type: "number", minimum: 0, maximum: 100 },
  fontWeight: { type: "string", enum: ["normal", "bold"] },
  fontStyle: { type: "string", enum: ["normal", "italic"] },
  fontUnderline: { type: "boolean" },
  fontStrikethrough: { type: "boolean" },
  bold: { type: "boolean" },
  italic: { type: "boolean" },
  underline: { type: "boolean" },
  textStyle: { type: "string", enum: ["plain", "bullet", "numbered", "quote"] },
  align: { type: "string", enum: ["left", "center", "right"] },
  fontAlign: { type: "string", enum: ["left", "center", "right"] },
  verticalAlign: { type: "string", enum: ["top", "middle", "bottom"] },
};

const BLOCK_ID = { type: "string", minLength: 1, maxLength: 128 } as const;
const EXPLICIT_ACTION_SCHEMAS = {
  undo: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "undo" } } },
  redo: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "redo" } } },
  rename_topic: { type: "object", additionalProperties: false, required: ["type", "blockId", "title"], properties: { type: { type: "string", const: "rename_topic" }, blockId: BLOCK_ID, title: { type: "string", minLength: 1, maxLength: 500 } } },
  rename_board: { type: "object", additionalProperties: false, required: ["type", "title"], properties: { type: { type: "string", const: "rename_board" }, title: { type: "string", minLength: 1, maxLength: 500 } } },
  update_description: { type: "object", additionalProperties: false, required: ["type", "blockId", "description"], properties: { type: { type: "string", const: "update_description" }, blockId: BLOCK_ID, description: { type: "string", maxLength: 4000 } } },
  update_style: { type: "object", additionalProperties: false, required: ["type", "blockId", "style"], properties: { type: { type: "string", const: "update_style" }, blockId: BLOCK_ID, style: { type: "object", minProperties: 1, additionalProperties: false, properties: STYLE_PROPERTIES } } },
  update_table_cells: { type: "object", additionalProperties: false, required: ["type", "blockId", "cells"], properties: { type: { type: "string", const: "update_table_cells" }, blockId: BLOCK_ID, cells: { type: "array", minItems: 1, maxItems: 400, items: { type: "object", additionalProperties: false, required: ["row", "column", "value"], properties: { row: { type: "integer", minimum: 0 }, column: { type: "integer", minimum: 0 }, value: { type: "string" }, formula: { type: "string", pattern: "^=", maxLength: 500 } } } } } },
  update_table_cell: { type: "object", additionalProperties: false, required: ["type", "blockId", "row", "column", "text"], properties: { type: { type: "string", const: "update_table_cell" }, blockId: BLOCK_ID, sheetId: BLOCK_ID, sheetName: { type: "string", minLength: 1, maxLength: 31 }, row: { type: "integer", minimum: 0 }, column: { type: "integer", minimum: 0 }, text: { type: "string", maxLength: 10000 } } },
  update_table_formula: { type: "object", additionalProperties: false, required: ["type", "blockId", "row", "column", "formula"], properties: { type: { type: "string", const: "update_table_formula" }, blockId: BLOCK_ID, row: { type: "integer", minimum: 0 }, column: { type: "integer", minimum: 0 }, formula: { type: "string", minLength: 2, maxLength: 500, pattern: "^=" } } },
  insert_table_row: { type: "object", additionalProperties: false, required: ["type", "blockId", "row"], properties: { type: { type: "string", const: "insert_table_row" }, blockId: BLOCK_ID, row: { type: "integer", minimum: 0 }, values: { type: "array", maxItems: 200, items: { type: "string", maxLength: 10000 } } } },
  insert_table_column: { type: "object", additionalProperties: false, required: ["type", "blockId", "column"], properties: { type: { type: "string", const: "insert_table_column" }, blockId: BLOCK_ID, column: { type: "integer", minimum: 0 }, values: { type: "array", maxItems: 500, items: { type: "string", maxLength: 10000 } } } },
  delete_table_row: { type: "object", additionalProperties: false, required: ["type", "blockId", "row"], properties: { type: { type: "string", const: "delete_table_row" }, blockId: BLOCK_ID, row: { type: "integer", minimum: 0 } } },
  delete_table_column: { type: "object", additionalProperties: false, required: ["type", "blockId", "column"], properties: { type: { type: "string", const: "delete_table_column" }, blockId: BLOCK_ID, column: { type: "integer", minimum: 0 } } },
  update_table_column: { type: "object", additionalProperties: false, required: ["type", "blockId", "column"], properties: { type: { type: "string", const: "update_table_column" }, blockId: BLOCK_ID, column: { type: "integer", minimum: 0 }, columnType: { type: "string", enum: ["text", "person", "date", "number", "select"] }, sortDirection: { type: "string", enum: ["asc", "desc", "none"] }, filterOptionId: { type: "string", maxLength: 128 } } },
  update_table_cell_format: { type: "object", additionalProperties: false, required: ["type", "blockId", "range"], properties: { type: { type: "string", const: "update_table_cell_format" }, blockId: BLOCK_ID, sheetId: BLOCK_ID, sheetName: { type: "string", minLength: 1, maxLength: 31 }, range: { type: "string", minLength: 1, maxLength: 64 }, fontSize: { type: "number", minimum: 1, maximum: 400 }, align: { type: "string", enum: ["left", "center", "right"] }, backgroundColor: { type: "string", maxLength: 64 }, textColor: { type: "string", maxLength: 64 }, bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" }, merge: { type: "boolean" } } },
  add_child: { type: "object", additionalProperties: false, required: ["type", "blockId", "text"], properties: { type: { type: "string", const: "add_child" }, blockId: BLOCK_ID, text: { type: "string", minLength: 1, maxLength: 500 } } },
  add_sibling: { type: "object", additionalProperties: false, required: ["type", "blockId", "text"], properties: { type: { type: "string", const: "add_sibling" }, blockId: BLOCK_ID, text: { type: "string", minLength: 1, maxLength: 500 } } },
  delete_node: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "delete_node" }, blockId: BLOCK_ID } },
  duplicate_node: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "duplicate_node" }, blockId: BLOCK_ID, offsetX: { type: "number", minimum: -500, maximum: 500 }, offsetY: { type: "number", minimum: -500, maximum: 500 } } },
  move_node: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "move_node" }, blockId: BLOCK_ID } },
  attach_to_parent: { type: "object", additionalProperties: false, required: ["type", "blockId", "newParent"], properties: { type: { type: "string", const: "attach_to_parent" }, blockId: BLOCK_ID, newParent: BLOCK_ID } },
  ...WORKSPACE_RUNTIME_EXTENDED_ACTION_SCHEMAS,
  ...WORKSPACE_RUNTIME_VISUAL_ACTION_SCHEMAS,
  ...WORKSPACE_RUNTIME_RICH_CONTENT_ACTION_SCHEMAS,
  ...IMAGE_FLOW_ACTION_SCHEMAS,
} as const;

const GENERIC_COMMAND_SCHEMAS = Object.fromEntries(
  WORKSPACE_COMMAND_NAMES
    .filter((name) => !(name in EXPLICIT_ACTION_SCHEMAS))
    .map((name) => [name, {
      type: "object",
      additionalProperties: true,
      required: ["type"],
      properties: { type: { type: "string", const: name } },
    }]),
);
const ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = { ...EXPLICIT_ACTION_SCHEMAS, ...GENERIC_COMMAND_SCHEMAS };

export type WorkspaceRuntimeActionType = string;
export const WORKSPACE_RUNTIME_ACTION_SCHEMAS: Record<WorkspaceRuntimeActionType, RuntimeActionSchema> = ACTION_SCHEMAS;
export const WORKSPACE_RUNTIME_ALLOWED_ACTIONS = Object.keys(WORKSPACE_RUNTIME_ACTION_SCHEMAS) as WorkspaceRuntimeActionType[];

function isRecord(value: unknown): value is WorkspaceJson {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesProperty(value: unknown, schema: PropertySchema): boolean {
  if (value === null) return schema.nullable === true;
  if ("const" in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) return false;
    if (schema.enum && !schema.enum.includes(value)) return false;
    return !schema.pattern || new RegExp(schema.pattern).test(value);
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
    return !schema.enum || schema.enum.includes(value);
  }
  return schema.type === "boolean" && typeof value === "boolean";
}

function matchesSchema(value: unknown, schema: PropertySchema): boolean {
  if (schema.type === "array") {
    return Array.isArray(value)
      && value.length >= (schema.minItems ?? 0)
      && value.length <= (schema.maxItems ?? Infinity)
      && (!schema.items || value.every((item) => matchesSchema(item, schema.items!)));
  }
  if (schema.type === "object") {
    if (!isRecord(value)) return false;
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false && !Object.keys(value).every((key) => key in properties)) return false;
    if (schema.required?.some((key) => !(key in value))) return false;
    return Object.entries(value).every(([key, item]) => !properties[key] || matchesSchema(item, properties[key]));
  }
  return matchesProperty(value, schema);
}

function validateStyle(style: unknown): string | null {
  if (!isRecord(style) || !Object.keys(style).length) return "update_style requires a non-empty style object.";
  const properties = STYLE_PROPERTIES;
  for (const [key, value] of Object.entries(style)) {
    const schema = properties[key];
    if (!schema || !matchesProperty(value, schema)) return `update_style.style.${key} is outside the supported schema.`;
  }
  return null;
}

export function validateWorkspaceRuntimeAction(action: WorkspaceJson): string | null {
  const type = action.type;
  if (typeof type !== "string" || !WORKSPACE_COMMAND_NAMES.includes(type)) {
    return "The proposal included a command outside the Workspace command registry.";
  }
  const schema = WORKSPACE_RUNTIME_ACTION_SCHEMAS[type as WorkspaceRuntimeActionType];
  const allowed = new Set(Object.keys(schema.properties));
  if (schema.additionalProperties !== true && !Object.keys(action).every((key) => allowed.has(key))) return `${type} contains unsupported fields.`;
  for (const key of schema.required) if (!(key in action)) return `${type} requires ${key}.`;
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in action) || key === "type") continue;
    if (!matchesSchema(action[key], property)) return `${type}.${key} is outside the supported schema.`;
  }
  if (!isBoundedJson(action)) return `${type} contains data outside the runtime size or nesting limit.`;
  if (schema.additionalProperties !== true
    && schema.required.includes("blockId")
    && !matchesProperty(action.blockId, BLOCK_ID)) return `${type} requires an exact blockId.`;
  if (type === "add_comment") {
    const target = action.blockId ?? action.target;
    const body = action.body ?? action.text ?? action.comment;
    if (typeof target !== "string" || !target.trim()) return "add_comment requires a blockId or target.";
    if (typeof body !== "string" || !body.trim()) return "add_comment requires a non-empty body.";
  }
  const semanticIssue = validateWorkspaceActionSemantics(action);
  if (semanticIssue) return semanticIssue;
  if (type === "rename_topic" && !matchesProperty(action.title, schema.properties.title)) return "rename_topic requires a non-empty title up to 500 characters.";
  if (type === "rename_board" && (!matchesProperty(action.title, schema.properties.title) || typeof action.title !== "string" || !action.title.trim())) return `${type} requires a non-empty title up to 500 characters.`;
  const richContentIssue = validateRuntimeRichContentAction(action);
  if (richContentIssue) return richContentIssue;
  if (type === "update_description" && !matchesProperty(action.description, schema.properties.description)) return "update_description requires a description up to 4000 characters.";
  if (type === "update_style") return validateStyle(action.style);
  if (type === "update_table_cells") {
    if (!Array.isArray(action.cells) || action.cells.length < 1 || action.cells.length > 400) return "update_table_cells requires 1 to 400 cell updates.";
    const coordinates = new Set<string>();
    for (const cell of action.cells) {
      if (!isRecord(cell) || !Object.keys(cell).every((key) => ["row", "column", "value", "formula"].includes(key))) return "Each cell update may only include row, column, value and formula.";
      const itemSchema = schema.properties.cells.items?.properties ?? {};
      if (!matchesProperty(cell.row, itemSchema.row) || !matchesProperty(cell.column, itemSchema.column) || !matchesProperty(cell.value, itemSchema.value)
        || (cell.formula !== undefined && !matchesProperty(cell.formula, itemSchema.formula))) return "Each cell update must match the declared row, column, value and formula schema.";
      const coordinate = `${cell.row}:${cell.column}`;
      if (coordinates.has(coordinate)) return "Cell coordinates in one update must be unique.";
      coordinates.add(coordinate);
    }
  }
  if (type === "update_table_cell" || type === "update_table_formula") {
    for (const key of ["row", "column", type === "update_table_cell" ? "text" : "formula"]) {
      if (!matchesProperty(action[key], schema.properties[key])) return `${type}.${key} is outside the supported schema.`;
    }
  }
  if (type === "insert_table_row" || type === "insert_table_column") {
    const values = action.values;
    if (values !== undefined && (!Array.isArray(values) || values.length > (type === "insert_table_row" ? 200 : 500)
      || values.some((item) => typeof item !== "string" || item.length > 10000))) return `${type}.values is outside the supported schema.`;
  }
  if (type === "update_table_cell_format" && ["bold", "italic", "underline"].some((key) => key in action && typeof action[key] !== "boolean")) {
    return "update_table_cell_format mark values must be boolean.";
  }
  if ((type === "add_child" || type === "add_sibling")
    && (!matchesProperty(action.text, schema.properties.text) || !String(action.text).trim())) {
    return `${type}.text must be a non-empty label up to 500 characters.`;
  }
  const visualIssue = validateWorkspaceRuntimeVisualAction(action);
  if (visualIssue) return visualIssue;
  return null;
}

function isBoundedJson(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (typeof value === "string") return value.length <= 20000;
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length <= 500 && value.every((item) => isBoundedJson(item, depth + 1));
  if (isRecord(value)) return Object.entries(value).every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && isBoundedJson(item, depth + 1));
  return false;
}

export function validateWorkspaceRuntimeTableTarget(action: WorkspaceJson, board: WorkspaceJson): string | null {
  const blocks = isRecord(board.blocks) ? board.blocks : {};
  const type = typeof action.type === "string" ? action.type : "";
  const collectionIssue = validateCollectionTarget(action, board);
  if (collectionIssue) return collectionIssue;
  const richContentIssue = validateRuntimeRichContentTarget(action, blocks);
  if (richContentIssue) return richContentIssue;
  if (["add_child", "add_sibling", "delete_node", "duplicate_node", "move_node", "attach_to_parent"].includes(type)) {
    const targetId = String(action.blockId ?? "");
    const target = isRecord(blocks[targetId]) ? blocks[targetId] as WorkspaceJson : null;
    if (!target) return `${type} requires an exact blockId for an existing block.`;
    if (type === "move_node" && typeof target.parentId !== "string") return "move_node requires a block that currently has a parent.";
    if (type === "delete_node" && typeof target.parentId !== "string") {
      const hasChildren = Object.values(blocks).some((item) => isRecord(item) && item.parentId === targetId);
      if (hasChildren) return "delete_node cannot remove a map root and its subtree in one command.";
    }
    if (type === "attach_to_parent") {
      const parentId = String(action.newParent ?? "");
      if (!isRecord(blocks[parentId])) return "attach_to_parent.newParent must identify an existing block.";
      if (targetId === parentId) return "attach_to_parent cannot attach a block to itself.";
      let currentId: string | undefined = parentId;
      const visited = new Set<string>();
      while (currentId && isRecord(blocks[currentId]) && !visited.has(currentId)) {
        if (currentId === targetId) return "attach_to_parent cannot create a parent cycle.";
        visited.add(currentId);
        const currentBlock: unknown = blocks[currentId];
        currentId = isRecord(currentBlock) && typeof currentBlock.parentId === "string" ? currentBlock.parentId : undefined;
      }
      if (currentId && visited.has(currentId)) return "attach_to_parent target ancestry already contains a cycle.";
    }
    return null;
  }
  if (!type.startsWith("update_table_")
    && !["insert_table_row", "insert_table_column", "delete_table_row", "delete_table_column"].includes(type)) return null;
  const block = isRecord(blocks[String(action.blockId)]) ? blocks[String(action.blockId)] as WorkspaceJson : null;
  if (!block || block.type !== "table") return "Table commands require an exact blockId for an existing table.";
  const data = isRecord(block.data) ? block.data : {};
  const rows = Number(data.rows);
  const columns = Number(data.cols);
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) return "The target table has invalid dimensions.";
  const row = Number(action.row);
  const column = Number(action.column);
  if (action.type === "insert_table_row" && (row < 0 || row > rows)) return "insert_table_row.row must point inside or just after the current rows.";
  if (action.type === "insert_table_column" && (column < 0 || column > columns)) return "insert_table_column.column must point inside or just after the current columns.";
  if (action.type === "delete_table_row" && (rows < 2 || row < 0 || row >= rows)) return "delete_table_row.row must identify an existing row; the last row cannot be deleted.";
  if (action.type === "delete_table_column" && (columns < 2 || column < 0 || column >= columns)) return "delete_table_column.column must identify an existing column; the last column cannot be deleted.";
  if (["update_table_cell", "update_table_formula"].includes(type) && (row < 0 || row >= rows || column < 0 || column >= columns)) return `${type} coordinates must identify a cell in the current table.`;
  if (action.type === "update_table_column" && (column < 0 || column >= columns)) return "update_table_column.column must identify an existing column.";
  if (action.type === "update_table_cells" && Array.isArray(action.cells)
    && action.cells.some((cell) => isRecord(cell) && (Number(cell.row) >= rows || Number(cell.column) >= columns))) return "update_table_cells coordinates must identify cells in the current table.";
  return null;
}
