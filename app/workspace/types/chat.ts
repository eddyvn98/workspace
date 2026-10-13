import type { WorkspaceKnowledgeReference } from "../utils/workspaceKnowledgeContext";

export interface WorkspaceAttachedFile {
  id?: string;
  tempId?: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "done" | "error";
  /** Whether the second, board-scoped knowledge-index write completed. */
  knowledgeStored?: boolean;
  url?: string;
  previewUrl?: string;
}

export interface WorkspaceChatFollowUpSuggestions {
  /** Digs deeper into content already covered this conversation or found on
   *  this board's own blocks/documents — must not introduce new facts. */
  grounded: string[];
  /** Branches out to related topics beyond this board's own content, drawing
   *  on general knowledge — may go outside what this board actually contains. */
  expand: string[];
}

export interface WorkspaceChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  /** Runtime pilot status shown separately from assistant answer content. */
  runtimeProgressText?: string;
  error?: boolean;
  /** Set when the user cancelled this in-flight response (Stop), or it was interrupted by a "send now". */
  cancelled?: boolean;
  attachments?: WorkspaceAttachedFile[];
  createdAt?: string;
  /** Agent-mode only (experiment/canvas-engine-v2 test track) — follow-up
   *  question chips shown under this assistant message. */
  suggestions?: WorkspaceChatFollowUpSuggestions;
  /** Agent-mode only — every block a tool call in this turn actually
   *  touched, for the Focus button/bubble-click to jump the camera to.
   *  Ported from legacy Mindmap's focusNodeIds (usePageMapActions.ts's
   *  centerOnNode), which workspace's chat panel never got. */
  focusBlockIds?: string[];
  /** Agent-mode only — one line per tool call that actually applied
   *  something, shown as a "✓ Applied" footer. */
  appliedSummaries?: string[];
  /** Agent-mode only — one line per tool call the model made that applied
   *  nothing (appliedActionCount 0), so a described-but-failed edit is
   *  visible instead of silently indistinguishable from a real success. */
  unresolvedSummaries?: string[];
  /** Runtime-only executor allowlist for stable Collection row IDs in verified reads. */
  verifiedRecordIds?: string[];
  /** Agent-mode only — search_knowledge_base hits this turn, shown as
   *  compact reference chips (name only; full path/excerpt on hover). */
  references?: WorkspaceKnowledgeReference[];
}

export interface WorkspaceChatSessionSummary {
  id: string;
  title: string;
  category?: string;
  region?: string | null;
  createdAt?: string;
  updatedAt: string;
  pinned?: boolean;
  difyConversationId?: string;
}

/** One send waiting for the current Dify request to finish — Dify (and the
 *  board-diffing useWorkspaceChat does around every send) only supports one
 *  request running at a time, so a send made while another is in flight
 *  queues here instead of being dropped. Editable/reorderable/cancellable
 *  until it's dequeued and actually sent. */
export interface WorkspaceQueuedSend {
  id: string;
  query: string;
  opts?: {
    attachedFiles?: WorkspaceAttachedFile[];
    contextPrompt?: string;
  };
}

export interface WorkspaceActiveRequest {
  assistantId: string;
  controller: AbortController;
  /** Filled in once Dify's stream reports it — needed to call the stop-task endpoint. */
  taskId: string | null;
  turnId?: string;
}
