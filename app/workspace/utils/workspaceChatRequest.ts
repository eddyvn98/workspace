/**
 * app/workspace/utils/workspaceChatRequest.ts
 *
 * The board chat and the mindmap chat send to the SAME Dify agent (both use
 * `x-category: WORKSPACE_AGENT_CHAT_KEY`, see app/api/chat/messages/route.ts) — one shared
 * workflow, not two. That workflow's model_selector input only recognizes a
 * fixed set of Dify model slugs ("google/gemini-3.7-flash", …), not the
 * human-readable names the UI's model picker shows ("Gemini 3.7 Flash").
 *
 * Legacy oracle: app/mindmap/utils/mindmap-chat-request.ts's
 * resolveMindmapDifyModelSelector / DIFY_MODEL_SELECTOR_ALIASES. Duplicated
 * rather than imported — CONTRACTS.md §"Never import from app/mindmap/**"
 * keeps this engine independent even though the underlying Dify workflow is
 * shared. A model with no alias entry (an id slug already, or a model the
 * table doesn't know) passes through unchanged, same as legacy.
 */
const DIFY_MODEL_SELECTOR_ALIASES: Record<string, string> = {
  "qwen flash": "qwen/qwen3.6-flash",
  "qwen-flash": "qwen/qwen3.6-flash",
  "qwen 3.6 flash": "qwen/qwen3.6-flash",
  "qwen plus": "qwen/qwen3.6-plus",
  "qwen-plus": "qwen/qwen3.6-plus",
  "qwen 3.6 plus": "qwen/qwen3.6-plus",
  "gemini 3.7 flash": "google/gemini-3.7-flash",
  "gemini-3-7-flash": "google/gemini-3.7-flash",
  "gemini 3.5 flash": "google/gemini-3.5-flash",
  "gemini-3-flash": "google/gemini-3.5-flash",
  "gemini 3.1 pro preview": "google/gemini-3.1-pro-preview",
  "gemini-3-pro": "google/gemini-3.1-pro-preview",
  "claude sonnet 5": "anthropic/claude-sonnet-5",
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "claude sonnet 4.6": "anthropic/claude-sonnet-4.6",
  "claude-sonnet": "anthropic/claude-sonnet-4.6",
  "gpt-5-chat": "openai/gpt-5.4",
  "gpt 5.4": "openai/gpt-5.4",
  "xai-grok": "x-ai/grok-4.3",
  "grok 4.3": "x-ai/grok-4.3",
  "gpt 5.6 sol": "openai/gpt-5.6-sol",
  "gpt 5.6 terra": "openai/gpt-5.6-terra",
  "gpt 5.6 luna": "openai/gpt-5.6-luna",
  "claude opus 5": "anthropic/claude-opus-5",
  "claude opus 4.7": "anthropic/claude-opus-4.7",
  "grok 4.6": "x-ai/grok-4.6",
  "kimi k3": "moonshotai/kimi-k3",
  "deepseek v4 pro (0813)": "deepseek/deepseek-v4-pro-0813",
  "qwen 3.8 max · openrouter": "qwen/qwen3.8-max",
  "glm-5.2 · openrouter": "z-ai/glm-5.2",
  "minimax m3": "minimax/minimax-m3",
  "qwen 3.8 max · tongyi": "qwen3.8-max",
  "qwen 3.7 max": "qwen3.7-max",
  "qwen 3.7 max (2026-06-08)": "qwen3.7-max-2026-06-08",
  "qwen 3.7 plus": "qwen3.7-plus",
  "qwen 3.7 flash": "qwen3.7-flash",
  "deepseek v4 pro · tongyi": "deepseek-v4-pro",
  // The remote Workspace Dify app exposes the Flash branch as
  // `deepseek-v4-flash`; `deepseek-flash` is a provider/API id, not a Dify
  // workflow case, and leaves the streaming run hanging in the ELSE path.
  "deepseek v4 flash · tongyi": "deepseek-v4-flash",
  "deepseek v4 flash": "deepseek-v4-flash",
  "deepseek v4.1 flash": "deepseek-v4-flash",
  "deepseek v4.1 flash · tongyi": "deepseek-v4-flash",
  "deepseek-v4.1-flash": "deepseek-v4-flash",
  "deepseek-v4-flash": "deepseek-v4-flash",
  "deepseek-flash": "deepseek-v4-flash",
  "glm-5.2 · tongyi": "z-ai/glm-5.2",
  "deepseek": "deepseek/deepseek-v4-pro",
  "kimi-k2": "moonshotai/kimi-k2.6",
};

export function resolveWorkspaceDifyModelSelector(modelSelector: string): string {
  const normalized = modelSelector.trim().toLowerCase();
  return DIFY_MODEL_SELECTOR_ALIASES[normalized] ?? modelSelector;
}

export const WORKSPACE_CHAT_CATEGORY = "WORKSPACE_AGENT_CHAT_KEY";

const WORKSPACE_MUTATION_PATTERN = /\b(?:add|apply|attach|connect|create|delete|detach|duplicate|edit|expand|format|make|move|rename|reorder|style|update|undo|redo)\b|(?:tạo|thêm|áp dụng|gắn|nối|xóa|bỏ|nhân bản|sửa|mở rộng|định dạng|di chuyển|đổi tên|sắp xếp|tô màu|hoàn tác|làm lại)/iu;

/** True when a request asks the Dify Workspace Agent to change the canvas,
 * so its tool-use reminder is added only to mutation turns. */
export function isWorkspaceMutationRequest(prompt: string): boolean {
  if (/\b(?:do not|don't|without|never)\s+(?:change|edit|modify|touch)|không\s+(?:chỉnh sửa|thay đổi|sửa)/iu.test(prompt)) {
    return false;
  }
  return WORKSPACE_MUTATION_PATTERN.test(prompt);
}

export interface WorkspaceAgentChatInputs {
  workspace_id: string;
  model_selector: string;
  /**
   * The remote Dify workflow declares this optional input as an object. Dify
   * rejects an omitted value in the API even when no Skill is selected, so
   * keep the empty object on every request and let the workflow bypass the
   * Skill branch deterministically.
   */
  selected_skills: Record<string, unknown>;
}

export function buildWorkspaceAgentInputs(workspaceId: string, modelSelector: string): WorkspaceAgentChatInputs {
  return {
    workspace_id: workspaceId,
    model_selector: resolveWorkspaceDifyModelSelector(modelSelector),
    selected_skills: {},
  };
}

/** Dify's workflow has its own default output language, so the natural
 * language of the query must be made explicit on every Workspace turn. The
 * browser locale and the language of existing canvas labels are not reliable
 * signals: an English request can be made from a Vietnamese browser against a
 * Vietnamese board. */
export function getWorkspaceResponseLanguageInstruction(prompt: string): string {
  const normalized = prompt.toLowerCase();
  if (/\b(?:english|tiếng anh|tieng anh)\b/i.test(normalized)) return "English";
  if (/\b(?:vietnamese|tiếng việt|tieng viet)\b/i.test(normalized)) return "Vietnamese";
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]/.test(prompt) || /\b(?:tháng|nào|có|cao|nhất|tôi|bạn|hãy|tạo|thêm|xóa|sửa|không|với|của)\b/i.test(normalized)) return "Vietnamese";
  if (/\b(?:which|what|where|when|why|how|the|and|using|please|create|show|summarize|modify|canvas)\b/i.test(normalized)) return "English";
  // Do not choose a fallback language. Dify must infer the language from the
  // actual user request (including languages this small heuristic does not
  // enumerate) and mirror it exactly.
  return "the exact language used in the user's request";
}

export function buildWorkspaceResponseLanguageInstruction(prompt: string): string {
  const language = getWorkspaceResponseLanguageInstruction(prompt);
  return [
    "## Output language (authoritative)",
    `Write every user-facing sentence, the JSON message field, action summaries, suggestions, and newly created node topics in ${language}.`,
    "Identify the language of the user's actual request and mirror it exactly. If the request is mixed, use the language of the latest substantive instruction. Never default to Vietnamese, English, or any other language, and never infer output language from the canvas, documents, browser locale, or previous turns.",
  ].join("\n");
}
