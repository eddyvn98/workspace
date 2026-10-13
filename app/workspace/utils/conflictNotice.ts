import type { MergeConflictItem } from "./mergeBoardConflict";

const MAX_LABEL = 40;
const MAX_LISTED = 3;

function plain(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** A short, human label for a block or connector involved in a conflict. */
export function describeConflictEntity(kind: MergeConflictItem["kind"], entity: unknown): string {
  if (kind === "connector") {
    const connector = (entity ?? {}) as { label?: string };
    return connector.label ? `connector "${connector.label}"` : "a connector";
  }
  const block = (entity ?? {}) as { type?: string; data?: Record<string, unknown> };
  const data = block.data ?? {};
  const raw = [data.markdown, data.label, data.title, data.text, data.name, data.html]
    .find((value): value is string => typeof value === "string" && plain(value).length > 0);
  if (!raw) return `a ${block.type ?? "block"}`;
  const text = plain(raw);
  return `"${text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text}"`;
}

/** Who made the change that was kept: an email when the block carries one. */
export function describeEditor(theirs: unknown): string {
  const editor = (theirs as { lastEditedBy?: unknown } | undefined)?.lastEditedBy;
  return typeof editor === "string" && editor.trim() ? editor.trim() : "another editor";
}

export interface ConflictNotice {
  title: string;
  description: string;
}

export function buildConflictNotice(items: MergeConflictItem[]): ConflictNotice {
  const listed = items.slice(0, MAX_LISTED).map((item) => describeConflictEntity(item.kind, item.mine ?? item.theirs));
  const more = items.length - listed.length;
  const editors = [...new Set(items.map((item) => describeEditor(item.theirs)))];
  const who = editors.length === 1 ? editors[0] : "other editors";
  const deleted = items.filter((item) => item.theirs === undefined).length;
  return {
    title: items.length === 1 ? "Your edit was replaced" : `${items.length} of your edits were replaced`,
    description: `${listed.join(", ")}${more > 0 ? ` and ${more} more` : ""} ${items.length === 1 ? "was" : "were"} changed${deleted === items.length ? " (deleted)" : ""} by ${who} at the same time, and their version was kept.`,
  };
}
