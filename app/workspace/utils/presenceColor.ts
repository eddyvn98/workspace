/**
 * Deterministic per-email display color/initials for the presence avatar
 * cluster — same calculation approach as the old app's
 * lib/mindmap/awareness-color.ts (djb2-ish hash into a fixed palette), not
 * shared code (this engine stays independent, see CONTRACTS.md header).
 */

const PRESENCE_COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6",
  "#06b6d4", "#f43f5e", "#14b8a6", "#eab308", "#6366f1",
];

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function colorForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return PRESENCE_COLORS[hashString(normalized) % PRESENCE_COLORS.length];
}

export function initialsForEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}
