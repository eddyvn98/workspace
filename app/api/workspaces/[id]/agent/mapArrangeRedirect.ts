import type { AgentBoardState } from "./operationsCore";
import { mapRoot, param, record, resolveId } from "./operationsCore";
import type { JsonMap } from "./operationsTables";

const MAP_LAYOUT_MODES: Record<string, string> = { fishbone: "fishbone", timeline: "timeline", catalog: "catalog", org_chart: "org-chart", orgchart: "org-chart" };

function selectedIds(state: AgentBoardState, raw: JsonMap): string[] {
  const listed = [param(raw, "blockIds"), param(raw, "ids"), param(raw, "targets")]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((item) => (typeof item === "string" ? item : String(record(item).id ?? record(item).blockId ?? "")))
    .filter(Boolean);
  const single = param(raw, "target");
  if (typeof single === "string") listed.push(single);
  return [...new Set(listed.map((item) => resolveId({ target: item }, state)).filter((id): id is string => Boolean(id)))];
}

/** "Arrange these blocks as a fishbone/timeline" over a whole existing map
 * means "change that map's layout". Handled as a manual arrangement it moved
 * blocks by hand and chained them with extra connectors while the map kept its
 * old layout, so rewrite it into the real layout change. */
export function redirectMapArrange(state: AgentBoardState, raw: JsonMap): JsonMap | null {
  const mode = String(param(raw, "mode") ?? param(raw, "layout") ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const layoutType = MAP_LAYOUT_MODES[mode];
  if (!layoutType) return null;
  const ids = selectedIds(state, raw);
  if (ids.length < 2) return null;
  const roots = new Set(ids.map((id) => mapRoot(state, id)));
  if (roots.size !== 1) return null;
  const rootId = [...roots][0];
  if (!record(state.blocks[rootId]?.mapLayout).family) return null;
  const members = Object.values(state.blocks).filter((block) => mapRoot(state, String(block.id)) === rootId);
  const covered = members.filter((block) => ids.includes(String(block.id))).length;
  if (!ids.includes(rootId) && covered < members.length * 0.8) return null;
  return { type: "update_map_style", target: rootId, layoutType };
}
