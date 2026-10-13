import { WORKSPACE_MAP_LAYOUT_PALETTES } from "@/app/workspace/utils/layout/mapLayoutPalettes";
import { isWorkspaceMapPaletteId, normalizeWorkspaceMapLayoutType } from "@/app/workspace/utils/workspaceMapLayoutContract";

type JsonMap = Record<string, unknown>;

export type AgentStyleState = {
  blocks: Record<string, JsonMap>;
  connectors: Record<string, JsonMap>;
};

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actionValue(action: JsonMap, key: string): unknown {
  return action[key] ?? record(action.params)[key] ?? record(action.style)[key];
}

/** Models know a palette by what it looks like ("blue", "soft pastel"), not by
 *  catalog id. Resolve an id, a display name, or a word of either, so "apply a
 *  blue palette" lands on a palette instead of failing as an unknown id. */
export function resolveMapPaletteId(input: unknown): string | undefined {
  const wanted = stringValue(input)?.toLowerCase();
  if (!wanted) return undefined;
  const exact = WORKSPACE_MAP_LAYOUT_PALETTES.find((item) => item.id.toLowerCase() === wanted || item.name.toLowerCase() === wanted);
  if (exact) return exact.id;
  const words = wanted.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && word !== "palette" && word !== "color" && word !== "colors" && word !== "theme");
  if (words.length === 0) return undefined;
  const scored = WORKSPACE_MAP_LAYOUT_PALETTES
    .map((item) => {
      const haystack = `${item.id} ${item.name}`.toLowerCase();
      return { id: item.id, score: words.filter((word) => haystack.includes(word)).length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

/** Accepts the UI's Treeview/Outline labels while preserving the catalog API id. */
export function normalizeAgentMapLayoutAction(action: JsonMap): JsonMap {
  const requested = actionValue(action, "layoutType") ?? actionValue(action, "mapType");
  const layoutType = normalizeWorkspaceMapLayoutType(requested);
  if (!layoutType && action.type === "create_map" && requested === undefined) return { ...action, layoutType: "hierarchy" };
  return layoutType ? { ...action, layoutType } : action;
}

function belongsToMap(state: AgentStyleState, blockId: string, rootId: string): boolean {
  const root = state.blocks[rootId];
  const block = state.blocks[blockId];
  if (!root || !block) return false;
  if (root.mapId && block.mapId === root.mapId) return true;

  let current = block;
  for (let guard = 0; guard < 1000; guard += 1) {
    if (String(current.id) === rootId) return true;
    const parentId = stringValue(current.parentId);
    if (!parentId || !state.blocks[parentId]) return false;
    current = state.blocks[parentId];
  }
  return false;
}

function depthOf(state: AgentStyleState, blockId: string, rootId: string): number {
  let depth = 0;
  let current = state.blocks[blockId];
  for (let guard = 0; current && guard < 1000; guard += 1) {
    if (String(current.id) === rootId) return depth;
    const parentId = stringValue(current.parentId);
    if (!parentId) return depth;
    current = state.blocks[parentId];
    depth += 1;
  }
  return depth;
}

/**
 * Completes the server-side half of a map palette update. The existing agent
 * executor owns layout mutation; this adapter persists the visual preset and
 * materializes connector colors so REST, realtime, and a later reload agree.
 */
export function applyServerMapPalette(
  state: AgentStyleState,
  action: JsonMap,
  rootId: string | undefined,
): boolean {
  if (!rootId || !state.blocks[rootId]) return false;
  const palette = resolveMapPaletteId(
    actionValue(action, "connectorPaletteId")
      ?? actionValue(action, "stylePresetId")
      ?? actionValue(action, "paletteId")
      ?? actionValue(action, "palette"),
  );
  if (!isWorkspaceMapPaletteId(palette)) return false;

  const root = state.blocks[rootId];
  root.mapLayout = {
    ...record(root.mapLayout),
    connectorPaletteId: palette,
    stylePresetId: palette,
  };

  const colors = WORKSPACE_MAP_LAYOUT_PALETTES.find((item) => item.id === palette)?.colors ?? [];
  if (colors.length === 0) return true;
  Object.values(state.connectors).forEach((connector) => {
    const from = stringValue(connector.fromBlockId);
    const to = stringValue(connector.toBlockId);
    if (!from || !to || !belongsToMap(state, from, rootId) || !belongsToMap(state, to, rootId)) return;
    const depth = Math.max(depthOf(state, to, rootId), 1) - 1;
    connector.strokeColor = colors[depth % colors.length];
  });
  return true;
}
