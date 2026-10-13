const PUBLIC_LAYOUT_ALIASES: Record<string, string> = {
  treeview: "catalog",
  outline: "catalog",
};

/** Normalizes user-facing layout names to the persisted action vocabulary. */
export function normalizeWorkspaceMapLayoutType(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  return PUBLIC_LAYOUT_ALIASES[normalized] ?? normalized;
}

export const WORKSPACE_MAP_PALETTE_IDS = [
  "default",
  "pastel",
  "minimal",
  "monochrome",
  "vibrant",
] as const;

export type WorkspaceMapPaletteId = typeof WORKSPACE_MAP_PALETTE_IDS[number];

export function isWorkspaceMapPaletteId(value: unknown): value is WorkspaceMapPaletteId {
  return typeof value === "string" && (WORKSPACE_MAP_PALETTE_IDS as readonly string[]).includes(value);
}
