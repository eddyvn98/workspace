import type { WorkspaceJson } from "./contracts";
import type { PropertySchema, RuntimeActionSchema } from "./actionSchema";

const content: PropertySchema = { type: "string", maxLength: 20000 };
const blockId: PropertySchema = { type: "string", minLength: 1, maxLength: 128, description: "Exact ID from board.blocks. Rich content requires a doc or shape block; a text outline node is not a document." };
const anchors: Record<string, PropertySchema> = {
  mode: { type: "string", enum: ["append", "prepend", "replace"] },
  afterHeading: { type: "string", minLength: 1, maxLength: 500 },
  lineId: { type: "string", minLength: 1, maxLength: 128 },
};
const marks: PropertySchema = {
  type: "object", additionalProperties: false,
  properties: {
    bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" },
    strike: { type: "boolean" }, strikethrough: { type: "boolean" }, code: { type: "boolean" },
    link: { type: "string", maxLength: 2000, pattern: "^(?:https?:|mailto:)\\S+$" },
  },
};

export const WORKSPACE_RUNTIME_RICH_CONTENT_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  update_node: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    anyOf: ["title", "html", "contentHtml", "labelHtml", "markdown", "text"].map((key) => ({ required: [key] })),
    properties: {
      type: { type: "string", const: "update_node" }, blockId,
      title: { type: "string", minLength: 1, maxLength: 500 },
      html: content, contentHtml: content, labelHtml: content, markdown: content, text: content,
      ...anchors,
    },
  },
  update_rich_text: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    anyOf: [{ required: ["html"] }, { required: ["markdown"] }, { required: ["content"] }, { required: ["query", "marks"] }, { required: ["query", "replacement"] }, { required: ["richText"] }],
    properties: {
      type: { type: "string", const: "update_rich_text" }, blockId,
      html: content, markdown: content, content,
      query: { type: "string", minLength: 1, maxLength: 20000 }, marks, replacement: content,
      replaceAll: { type: "boolean" }, ...anchors,
      richText: {
        type: "object", additionalProperties: false,
        anyOf: [{ required: ["html"] }, { required: ["markdown"] }, { required: ["content"] }, { required: ["text", "marks"] }],
        properties: { html: content, markdown: content, content, text: content, marks, ...anchors },
      },
    },
  },
};

const record = (value: unknown): WorkspaceJson =>
  value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
const hasString = (action: WorkspaceJson, keys: string[]) => keys.some((key) => typeof action[key] === "string");

export function validateRuntimeRichContentAction(action: WorkspaceJson): string | null {
  if (action.type === "update_node") {
    const hasTitle = typeof action.title === "string" && action.title.trim().length > 0;
    return hasTitle || hasString(action, ["html", "contentHtml", "labelHtml", "markdown", "text"])
      ? null : "update_node requires a title or html/markdown/text content.";
  }
  if (action.type !== "update_rich_text") return null;
  const richText = record(action.richText);
  if (hasString(action, ["html", "markdown", "content"]) || hasString(richText, ["html", "markdown", "content"])) return null;
  const query = action.query ?? richText.text;
  const marking = record(action.marks ?? richText.marks);
  const hasMark = Object.values(marking).some((value) => value === true || typeof value === "string" && value.length > 0);
  return typeof query === "string" && query.trim() && (hasMark || typeof action.replacement === "string")
    ? null : "update_rich_text requires html/markdown/content or query with marks/replacement.";
}

export function validateRuntimeRichContentTarget(action: WorkspaceJson, blocks: WorkspaceJson): string | null {
  if (action.type !== "update_node" && action.type !== "update_rich_text") return null;
  const block = record(blocks[String(action.blockId ?? "")]);
  if (!Object.keys(block).length) return `${action.type} requires an exact blockId for an existing block.`;
  if (action.type === "update_rich_text" && !["doc", "shape"].includes(String(block.type))) {
    return "update_rich_text requires a doc or shape blockId; text outline nodes cannot hold document HTML.";
  }
  if (action.type === "update_node") {
    if (hasString(action, ["html", "contentHtml", "labelHtml"]) && !["doc", "shape"].includes(String(block.type))) {
      return "update_node HTML requires a doc or shape blockId.";
    }
    if (typeof action.markdown === "string" && block.type !== "doc") return "update_node markdown requires a doc blockId.";
  }
  return null;
}
