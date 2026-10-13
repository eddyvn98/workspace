import type { WorkspaceChatFollowUpSuggestions, WorkspaceChatMessage } from "../types/chat";
import type { RemoteBoard } from "../hooks/workspaceBoardApi";

export interface DifyAgentResponseMetadata {
  suggestions?: WorkspaceChatFollowUpSuggestions;
  focusBlockIds?: string[];
  appliedSummaries?: string[];
  unresolvedSummaries?: string[];
  /** Workspace runtime verified record IDs, not model-trusted in legacy mode. */
  verifiedRecordIds?: string[];
  references?: WorkspaceChatMessage["references"];
}

export interface ParsedDifyAgentAnswer extends DifyAgentResponseMetadata {
  content: string;
  /** Set only by client verification; never accepted from provider JSON. */
  verifiedReadOnlyResult?: boolean;
}

/**
 * Model metadata is only a claim. The persisted board snapshot remains the
 * source of truth, so callers must not show an action receipt from metadata
 * alone when the board did not change.
 */
export function hasClaimedDifyMutation(parsed: DifyAgentResponseMetadata): boolean {
  return Boolean(parsed.appliedSummaries?.length || parsed.focusBlockIds?.length);
}

// An explicit "do not change anything" outranks any verb that appears in the
// same request ("summarize the board, make no changes").
const READ_ONLY_REQUEST =
  /(?:\b(?:no|without|never|don'?t|do not)\b[^.\n]{0,24}\b(?:changes?|edits?|modif\w+|updates?)\b|\bread[- ]only\b|không\s+(?:được\s+)?(?:thay đổi|sửa|chỉnh sửa|cập nhật))/iu;

const VIETNAMESE_MUTATION_VERBS =
  /(?:đổi|thay đổi|cập nhật|sửa|chỉnh sửa|đặt|khôi phục|hoàn nguyên|xóa|xoá|thêm|tạo|vẽ|gạch chân|in đậm|in nghiêng|định dạng|sắp xếp|di chuyển|kết nối|nhân bản)/iu;

// Word-bounded: a bare substring match read "address" as "add" and "changes"
// inside a negation as a change request.
const ENGLISH_MUTATION_VERBS =
  /\b(?:duplicate|set|restore|reset|change|update|edit|delete|remove|add|create|draw|format|style|reorder|move|connect|rename|replace|apply|insert)(?:s|es|d|ed|ing)?\b|\bmake\b.*\b(?:bold|italic|underline)\b/iu;

export function isCanvasMutationRequest(request: string): boolean {
  if (READ_ONLY_REQUEST.test(request)) return false;
  return VIETNAMESE_MUTATION_VERBS.test(request) || ENGLISH_MUTATION_VERBS.test(request);
}

export function hasPlainMutationClaim(answer: string): boolean {
  return /(?:đã\s+(?:đổi|thay đổi|cập nhật|sửa|chỉnh sửa|đặt|khôi phục|hoàn nguyên|xác minh|xử lý|xóa|xoá|thêm|tạo|vẽ|gạch chân|áp dụng|định dạng|sắp xếp|di chuyển)|updated|changed|deleted|removed|added|created|formatted|applied|reordered|moved|successfully)/iu.test(answer);
}

export function hasUnpersistedMutationClaim(
  parsed: ParsedDifyAgentAnswer,
  request: string,
  persistedChange: boolean,
): boolean {
  if (parsed.verifiedReadOnlyResult) return false;
  const claimed = hasClaimedDifyMutation(parsed) ||
    (isCanvasMutationRequest(request) && hasPlainMutationClaim(parsed.content));
  return claimed && !persistedChange;
}

export const DIFY_MUTATION_NOT_PERSISTED_MESSAGE =
  "The AI reported an update, but the canvas and database did not change. This is not counted as a success; please try again.";

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return result.length > 0 ? result : [];
}

function normalizeEscapedLineBreaks(value: string): string {
  const codeSegment = /(```[\s\S]*?```|`[^`\n]*`)/g;
  const segments = value.split(codeSegment);
  const escapedBreakCount = segments.reduce((count, segment, index) => {
    if (index % 2 === 1) return count;
    return count + (segment.match(/\\r\\n|\\n|\\r/g)?.length ?? 0);
  }, 0);
  if (escapedBreakCount < 2) return value;
  return segments.map((segment, index) => index % 2 === 1
    ? segment
    : segment.replace(/\\r\\n|\\n|\\r/g, "\n")).join("");
}

function parseAnswerObject(answer: string): Record<string, unknown> | null {
  const trimmed = answer.trim();
  const withoutReasoning = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const candidates = [trimmed, withoutReasoning];
  const fenced = withoutReasoning.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = withoutReasoning.indexOf("{");
  const lastBrace = withoutReasoning.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutReasoning.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      let parsed: unknown = JSON.parse(candidate);
      for (let depth = 0; depth < 3; depth += 1) {
        if (typeof parsed === "string") {
          parsed = JSON.parse(parsed);
          continue;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) break;
        const object = parsed as Record<string, unknown>;
        if (typeof object.answer === "string" || object.suggestions || object.focusBlockIds) return object;
        const nested = object.result ?? object.output ?? object.data;
        if (nested === undefined) break;
        parsed = nested;
      }
    } catch {
      // Plain-text Dify answers are the normal fallback.
    }
  }

  // Some models emit the response contract with unescaped quotes inside the
  // human-readable `answer` value. It is not valid JSON, but the answer is
  // still recoverable because the next contract key is stable.
  const malformedAnswer = withoutReasoning.match(
    /"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"focusBlockIds"\s*:/i,
  );
  if (malformedAnswer?.[1]) {
    return {
      answer: malformedAnswer[1].replace(/\\"/g, '"'),
      focusBlockIds: [],
      appliedSummaries: [],
      unresolvedSummaries: [],
    };
  }
  return null;
}

/** Dify reasoning may mention JSON keys before emitting the actual payload.
 * Inspect the parsed object instead of searching the whole text for
 * `"answer"`, otherwise a workspace-actions response is misclassified as a
 * structured answer and its canvas action is skipped. */
export function isStructuredDifyAnswer(answer: string): boolean {
  const object = parseAnswerObject(answer);
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, "answer"));
}

export function parseDifyAgentAnswer(answer: string): ParsedDifyAgentAnswer {
  const object = parseAnswerObject(answer);
  if (!object) return { content: normalizeEscapedLineBreaks(answer) };

  const suggestions = object.suggestions && typeof object.suggestions === "object"
    ? object.suggestions as Record<string, unknown>
    : undefined;

  return {
    content: normalizeEscapedLineBreaks(
      typeof object.answer === "string" && object.answer.trim() ? object.answer : answer,
    ),
    suggestions: suggestions
      ? {
          grounded: asStringArray(suggestions.grounded) ?? [],
          expand: asStringArray(suggestions.expand) ?? [],
        }
      : undefined,
    focusBlockIds: asStringArray(object.focusBlockIds),
    appliedSummaries: asStringArray(object.appliedSummaries),
    unresolvedSummaries: asStringArray(object.unresolvedSummaries),
    verifiedRecordIds: asStringArray(object.verifiedRecordIds),
    references: Array.isArray(object.references) ? object.references as WorkspaceChatMessage["references"] : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stableBlockValue(value: unknown): string {
  const block = asRecord(value);
  const content = { ...block };
  delete content.updatedAt;
  delete content.lastEditedBy;
  return stableValue(content);
}

export interface BoardChangeFeedback {
  focusBlockIds: string[];
  appliedSummaries: string[];
}

export function deriveBoardChangeFeedback(before: RemoteBoard | null, after: RemoteBoard | null): BoardChangeFeedback {
  if (!before || !after) return { focusBlockIds: [], appliedSummaries: [] };

  const beforeBlocks = asRecord(before.blocks);
  const afterBlocks = asRecord(after.blocks);
  const blockIds = new Set([...Object.keys(beforeBlocks), ...Object.keys(afterBlocks)]);
  const changedBlocks = [...blockIds].filter(
    (id) => stableBlockValue(beforeBlocks[id]) !== stableBlockValue(afterBlocks[id]),
  );
  const focusBlockIds = changedBlocks.filter((id) => Object.prototype.hasOwnProperty.call(afterBlocks, id));

  const beforeConnectors = asRecord(before.connectors);
  const afterConnectors = asRecord(after.connectors);
  const connectorIds = new Set([...Object.keys(beforeConnectors), ...Object.keys(afterConnectors)]);
  const changedConnectors = [...connectorIds].filter(
    (id) => stableValue(beforeConnectors[id]) !== stableValue(afterConnectors[id]),
  );

  const beforeOrder = Array.isArray(before.blockOrder) ? before.blockOrder.map(String) : [];
  const afterOrder = Array.isArray(after.blockOrder) ? after.blockOrder.map(String) : [];
  const orderChanged = stableValue(beforeOrder) !== stableValue(afterOrder);
  const reorderedBlockIds = orderChanged
    ? afterOrder.filter((id, index) => beforeOrder[index] !== id && Object.prototype.hasOwnProperty.call(afterBlocks, id))
    : [];
  const boardLevelChanges = [
    stableValue(before.title) !== stableValue(after.title) ? "board title" : "",
    stableValue(before.frames ?? []) !== stableValue(after.frames ?? []) ? "presentation frames" : "",
    ["treeLayoutDirection", "treeGrowthMode", "treeLayoutFamily", "treeTimelineBranchMode", "treeTimelineDescendantStyle", "treeCatalogDescendantStyle"]
      .some((key) => stableValue(before[key as keyof RemoteBoard]) !== stableValue(after[key as keyof RemoteBoard]))
      ? "map layout" : "",
  ].filter(Boolean);

  if (changedBlocks.length === 0 && changedConnectors.length === 0 && !orderChanged && boardLevelChanges.length === 0) {
    return { focusBlockIds, appliedSummaries: [] };
  }

  const summary = [
    changedBlocks.length > 0 ? `${changedBlocks.length} block(s)` : "",
    changedConnectors.length > 0 ? `${changedConnectors.length} connector(s)` : "",
    orderChanged ? "block order" : "",
    ...boardLevelChanges,
  ].filter(Boolean).join(" and ");
  return {
    focusBlockIds: Array.from(new Set([...focusBlockIds, ...reorderedBlockIds])),
    appliedSummaries: [`Updated ${summary}`],
  };
}

export interface NetZeroBoardRevisionAdvance {
  beforeRevision: number;
  afterRevision: number;
}

/** Detects a server write during a turn whose final persisted content matches
 *  the starting snapshot. This is evidence of no net board change, not proof
 *  that each requested sub-step succeeded. */
export function getNetZeroBoardRevisionAdvance(
  before: RemoteBoard | null,
  after: RemoteBoard | null,
): NetZeroBoardRevisionAdvance | null {
  if (!before || !after || deriveBoardChangeFeedback(before, after).appliedSummaries.length > 0) return null;
  if (typeof before.revision !== "number" || typeof after.revision !== "number") return null;
  return after.revision > before.revision
    ? { beforeRevision: before.revision, afterRevision: after.revision }
    : null;
}

export function buildNetZeroBoardRevisionNotice(
  advance: NetZeroBoardRevisionAdvance,
): string {
  return `Board verification: revision ${advance.beforeRevision} → ${advance.afterRevision}, but final content matches the starting snapshot, so there is no net content change. The final snapshot does not confirm each individual step.`;
}

/** A Dify response may arrive while local edits are still pending persistence.
 * Only adopt a server snapshot when it proves that a newer board revision exists. */
export function hasNewerDifyBoardRevision(before: RemoteBoard | null, after: RemoteBoard | null): boolean {
  return Boolean(
    before && after &&
    typeof before.revision === "number" &&
    typeof after.revision === "number" &&
    after.revision !== before.revision,
  );
}
