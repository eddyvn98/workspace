export const WORKSPACE_SAFE_FALLBACK = "I couldn't produce a safe response. Please try again.";

const INTERNAL_PARAGRAPH_PATTERNS = [
  /\bgreeting acknowledged\b/i,
  /\bexploring new avenues\b/i,
  /\bi(?:'ve| have) processed your simple greeting\b/i,
  /\bcurrent focus is on identifying the appropriate response mode\b/i,
  /\bi(?:'m| am) considering how best to acknowledge your input\b/i,
  /\bmy current thought process is\b/i,
  /\byour input is key to determining the next step\b/i,
];

const PROMPT_ECHO_PATTERNS = [
  /\[system instruction:/i,
  /\baction shapes:\b/i,
  /\bexisting topics \(avoid duplicating\):/i,
  /\bcurrent canvas:\s*-/i,
  /\btarget:\s*\{"mode\:/i,
];

const INTERNAL_NODE_ID = /\bn_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
const INTERNAL_ID_LIST = /\s*\[\s*(?:n_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\s*,?\s*)+\]\s*/gi;
const INTERNAL_REFERENCE = /\b(?:ref|nodeId|mapId|fromNodeId|toNodeId)\s*[:=]\s*["']?[A-Za-z0-9._:-]+["']?/gi;
const INTERNAL_BLOCK_ID = "(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8})";
const INTERNAL_BLOCK_LIST_PREFIX = new RegExp(
  `(\\r?\\n|^)` +
    `(\\s*(?:[-*•]|\\d+[.)])\\s+)${INTERNAL_BLOCK_ID}\\s*:\\s*`,
  "gim",
);
const INTERNAL_HTML_LIST_PREFIX = new RegExp(
  `(<li\\b[^>]*>\\s*)${INTERNAL_BLOCK_ID}\\s*:\\s*`,
  "gim",
);
const UUID_TOKEN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const BARE_UUID = new RegExp(UUID_TOKEN, "gi");
const BRACKETED_UUID = new RegExp(`\\s*\\[(?:\\s*${UUID_TOKEN}\\s*(?:[,;]\\s*${UUID_TOKEN}\\s*)*)\\]\\s*`, "gi");
const INTERNAL_ID_FIELD = /["']?\b(?:blockId|resourceId)["']?\s*[:=]\s*["']?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']?\s*,?\s*/gi;

const VERIFIED_ROW_UUID = /\bRecord ID:\s+([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\b/gi;
function stripInternalReferences(value: string, verifiedRecordIds: readonly string[] = []): string {
  const allowed = new Set(verifiedRecordIds.slice(0, 30).map((id) => id.toLowerCase()));
  const verified: string[] = [];
  const protectedRows = value.replace(VERIFIED_ROW_UUID, (whole, id: string) => {
    if (!allowed.has(id.toLowerCase())) return whole;
    const index = verified.push(id) - 1;
    return `Record ID: __WORKSPACE_VERIFIED_ROW_${index}__`;
  });
  const links: string[] = [];
  const protectedValue = protectedRows.replace(/\]\((<?(?:https?:\/\/|\/(?!\/))[^\s)]+>?)\)/gi, (_match, target: string) => {
    const index = links.push(target) - 1;
    return `](__WORKSPACE_LINK_TARGET_${index}__)`;
  });
  return protectedValue
    .replace(INTERNAL_BLOCK_LIST_PREFIX, "$1$2")
    .replace(INTERNAL_HTML_LIST_PREFIX, "$1")
    .replace(INTERNAL_ID_LIST, " ")
    .replace(INTERNAL_NODE_ID, "")
    .replace(BRACKETED_UUID, " ")
    .replace(INTERNAL_ID_FIELD, "")
    .replace(BARE_UUID, "")
    .replace(INTERNAL_REFERENCE, " ")
    .replace(/\bCanvas graph retrieval from DB\b/gi, "canvas content")
    .replace(/\bGraph DB\b/gi, "canvas content")
    .replace(/\bexplicit relationship\b/gi, "direct relationship")
    .replace(/\bpath root\b/gi, "path from the root")
    .replace(/\bVirtual Root\b/g, "the whole canvas")
    .replace(/__WORKSPACE_LINK_TARGET_(\d+)__/g, (match, index: string) => links[Number(index)] ?? match)
    .replace(/__WORKSPACE_VERIFIED_ROW_(\d+)__/g, (match, index: string) => verified[Number(index)] ?? match);
}

/** Removes a model's <think> reasoning, including an unterminated trailing
 *  block from a truncated stream. Exported because any consumer that parses
 *  an answer's lines has to drop this first — otherwise the reasoning text
 *  itself gets treated as content. */
export function stripThinkingBlocks(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "");
}

function stripActionFences(value: string): string {
  return value.replace(/```mindmap-actions[\s\S]*?```/gi, "").replace(/```(?:text|json)?\s*mindmap-actions[\s\S]*?```/gi, "");
}

function stripDisplayCodeFences(value: string): string {
  return value.replace(/```(?:[\w-]+)?\s*\n?([\s\S]*?)```/g, "$1");
}

function stripKnownInternalParagraphs(value: string): string {
  return value.split(/\n\s*\n/).filter((paragraph) => !INTERNAL_PARAGRAPH_PATTERNS.some((pattern) => pattern.test(paragraph))).join("\n\n");
}

export function normalizeQuotedDiagnosticFields(value: string): string {
  return value.replace(
    /\b(label|title|topic)\s*=\s*"([\s\S]*?)"(?=\s*(?:;|,|$))/gi,
    (_match, field: string, rawValue: string) => `${field} = "${rawValue.replace(/\s+/g, " ").trim()}"`,
  );
}

export function safeWorkspaceAssistantContent(content: string, isStreaming = false, verifiedRecordIds: readonly string[] = []): string {
  const sanitized = stripKnownInternalParagraphs(
    stripInternalReferences(
      normalizeQuotedDiagnosticFields(stripDisplayCodeFences(stripActionFences(stripThinkingBlocks(content)))), verifiedRecordIds,
    ),
  ).trim();
  if (!sanitized) return isStreaming ? "" : WORKSPACE_SAFE_FALLBACK;
  if (PROMPT_ECHO_PATTERNS.some((pattern) => pattern.test(sanitized))) return isStreaming ? "" : WORKSPACE_SAFE_FALLBACK;
  return sanitized;
}
