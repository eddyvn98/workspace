import type { RuntimeActionSchema } from "./actionSchema";

const commentId = { type: "string", minLength: 1, maxLength: 128 } as const;
const blockId = { type: "string", minLength: 1, maxLength: 500 } as const;
const body = { type: "string", minLength: 1, maxLength: 10_000 } as const;

export const WORKSPACE_RUNTIME_COMMENT_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  add_comment: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "add_comment" }, blockId, target: blockId,
      body, text: body, comment: body, parentId: commentId, replyTo: commentId,
    },
  },
  list_comments: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "list_comments" }, blockId: commentId },
  },
  edit_comment: {
    type: "object", additionalProperties: false, required: ["type", "commentId", "body"],
    properties: { type: { type: "string", const: "edit_comment" }, commentId, body },
  },
  resolve_comment: {
    type: "object", additionalProperties: false, required: ["type", "commentId"],
    properties: { type: { type: "string", const: "resolve_comment" }, commentId },
  },
  reopen_comment: {
    type: "object", additionalProperties: false, required: ["type", "commentId"],
    properties: { type: { type: "string", const: "reopen_comment" }, commentId },
  },
  delete_comment: {
    type: "object", additionalProperties: false, required: ["type", "commentId"],
    properties: { type: { type: "string", const: "delete_comment" }, commentId },
  },
};
