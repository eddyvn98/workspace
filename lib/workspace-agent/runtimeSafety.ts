import type { WorkspaceJson } from "./contracts";
import { getWorkspaceResponseLanguageInstruction } from "@/app/workspace/utils/workspaceChatRequest";

export const WORKSPACE_READ_ONLY_COMMANDS = new Set([
  "list_comments",
  "list_versions",
  "export_board",
  "list_shares",
  "list_files",
]);

const EXPLICIT_CONFIRMATION = /\b(confirm(?:ed)?|yes|proceed|approve|go ahead)\b|xác nhận|đồng ý|tiến hành|cứ làm|hãy thực hiện/i; // vi-allow
const NEGATED_OR_CANCELLED = /\b(no|not|never|cannot|(?:can|won|shan|shouldn|couldn|wouldn|mustn|needn|don|doesn|didn|isn|aren|wasn|weren|hasn|haven|hadn)[’']t|do not|stop|cancel|hold off|without|refuse|decline|reject|wait)\b|không|đừng|chưa|hủy|huỷ|từ chối|để sau|khoan/i; // vi-allow

function record(value: unknown): WorkspaceJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
}

function actionField(action: WorkspaceJson, key: string): unknown {
  const params = record(action.params);
  return action[key] ?? params[key];
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function containsExactTarget(text: string, target: string): boolean {
  const escaped = normalized(target).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.length > 0 && new RegExp(`(?<![\\p{L}\\p{N}_@.+-])${escaped}(?![\\p{L}\\p{N}_@+-]|\\.[\\p{L}\\p{N}_@+-])`, "u").test(normalized(text));
}

/** High-impact changes need an affirmative in this user turn plus the exact target in that turn. */
export function workspaceActionNeedsConfirmation(action: WorkspaceJson, query: string, context = ""): boolean {
  const type = String(action.type ?? "");
  const flagged = action.confirmBulkDelete === true || record(action.params).confirmBulkDelete === true;
  const protectedAction = ["restore_version", "share_board", "remove_share", "set_public_link"].includes(type);
  if (!flagged && !protectedAction) return false;
  if (NEGATED_OR_CANCELLED.test(query) || !EXPLICIT_CONFIRMATION.test(query)) return true;
  const exactFields = type === "share_board" ? ["email", "role"]
    : type === "remove_share" ? ["email"]
      : type === "restore_version" ? ["snapshotId"]
        : [];
  if (flagged && !/\b(delete|remove|clear|bulk)\b|xóa|xoá|xoa|gỡ|xoa het/i.test(query)) return true; // vi-allow
  if (type === "set_public_link") {
    const enabled = actionField(action, "enabled");
    const stateMentioned = enabled === true
      ? /\b(enable|enabled|turn on|public link)\b|bật|mở liên kết/i.test(query) // vi-allow
      : enabled === false && (/\b(disable|disabled|turn off)\b|tắt liên kết/i.test(query)); // vi-allow
    if (!stateMentioned) return true;
    if (enabled === true) {
      const expiration = actionField(action, "expiration");
      const expiryConfirmed = expiration === undefined || expiration === null
        ? /\b(?:7d|7[- ]days?|seven[- ]days?|7[- ]ngay)\b/.test(normalized(query))
        : typeof expiration === "string" && containsExactTarget(query, expiration);
      if (!expiryConfirmed) return true;
    }
  }
  if (exactFields.some((key) => {
    const value = actionField(action, key);
    return value === undefined || !containsExactTarget(query, String(value));
  })) return true;
  if (flagged) {
    const ids = ["blockId", "snapshotId"].flatMap((key) => typeof actionField(action, key) === "string" ? [String(actionField(action, key))] : []);
    for (const key of ["blockIds", "ids", "targets"]) {
      const value = actionField(action, key);
      if (Array.isArray(value)) ids.push(...value.filter((item): item is string => typeof item === "string"));
    }
    if (!ids.length) return true;
    const exactInQuery = ids.every((id) => containsExactTarget(query, id));
    const selectedFromContext = /\b(selected|current selection)\b|đang chọn|đã chọn/i.test(query) // vi-allow
      && ids.every((id) => containsExactTarget(context, id));
    if (!exactInQuery && !selectedFromContext) return true;
  }
  return false;
}

/** Call only after confirmation checks so reuse cannot retain a different public-link expiry. */
export function bindConfirmedWorkspaceDefaults(action: WorkspaceJson): WorkspaceJson {
  return action.type === "set_public_link" && actionField(action, "enabled") === true && actionField(action, "expiration") == null
    ? { ...action, expiration: "7d" }
    : action;
}

function compact(value: unknown, depth = 0, maxString = 3500, maxArray = 12, maxEntries = 24): unknown {
  if (typeof value === "string") return value.slice(0, maxString);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, maxArray).map((item) => compact(item, depth + 1, maxString, maxArray, maxEntries));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, maxEntries).map(([key, item]) => [key, compact(item, depth + 1, maxString, maxArray, maxEntries)]));
  }
  return String(value ?? "");
}

export function compactWorkspaceReadResult(actionType: string, value: unknown): WorkspaceJson {
  let result = compact(value, 0, 1200, 8, 16);
  if (JSON.stringify(result).length > 8000) result = compact(value, 0, 500, 4, 12);
  return { actionType, result: result && typeof result === "object" && !Array.isArray(result) ? result as WorkspaceJson : { value: result } };
}

export function summarizeConfirmationRequest(actions: WorkspaceJson[], query: string): string {
  const types = actions.filter((action) => workspaceActionNeedsConfirmation(action, query)).map((action) => String(action.type)).join(", ");
  return getWorkspaceResponseLanguageInstruction(query) === "Vietnamese"
    ? `Trước khi tiếp tục (${types}), vui lòng xác nhận rõ thao tác và đúng mục tiêu trong yêu cầu.` // vi-allow
    : `Before I continue (${types}), please explicitly confirm the action and exact target in your request.`;
}
