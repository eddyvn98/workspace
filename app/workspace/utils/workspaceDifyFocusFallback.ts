import type { RemoteBoard } from "../hooks/workspaceBoardApi";
import type { CanvasBlock } from "../types/block";
import { extractBlockLabel } from "./workspaceChatContext";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function focusTargetFromQuery(query: string): string | null {
  const match = query.match(
    /(?:focus|tập trung)\s+(?:vào|on)?\s*(?:block|khối|node)?\s*(?:có\s+(?:tên|nội dung)|named|called)?\s*[“”"'`]?(.+?)[“”"'`]?\s*(?:,|\.|!|\?|\s+(?:không|without|and\s+not)\b|$)/iu,
  );
  const target = match?.[1]?.trim();
  return target ? target : null;
}

/**
 * Some Dify models follow the natural-language answer contract but omit the
 * optional JSON metadata. Keep the Focus affordance reliable by resolving a
 * clearly requested label against the board already loaded in the browser.
 * This is read-only and deliberately returns no IDs when the request cannot
 * be matched. If several blocks share the label, all matching IDs are
 * returned, matching the board search behavior used by the agent.
 */
export function deriveDifyFocusFallbackIds(query: string, board: RemoteBoard | null): string[] {
  if (!board || !/(?:focus|tập trung)/iu.test(query)) return [];
  const target = focusTargetFromQuery(query);
  if (!target) return [];
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) return [];

  return Object.entries(asRecord(board.blocks))
    .filter(([id, rawBlock]) => {
      if (!id || !rawBlock || typeof rawBlock !== "object" || Array.isArray(rawBlock)) return false;
      const label = extractBlockLabel(rawBlock as CanvasBlock);
      return normalizeText(label) === normalizedTarget;
    })
    .map(([id]) => id);
}
