// The editor's own vocabulary is the contract: structures Hierarchy, Treeview,
// Timeline, Fishbone, Flowchart, Swimlane; options One side/Both side and
// Direction Right/Left/Down/Up. Older AI names stay accepted as aliases and
// are translated to those settings.
const INTERNAL_LAYOUTS = new Set([
  "logical-right", "logical-left", "logical-down", "logical-up", "mindmap", "mindmap-vertical", "catalog", "timeline", "vertical-timeline", "fishbone",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const ALIASES: Record<string, string> = {
  "fish-bone": "fishbone", ishikawa: "fishbone", "cause-and-effect": "fishbone",
  // The editor has no separate org chart: it is Hierarchy growing Down.
  "org-chart": "logical-down", orgchart: "logical-down", "organization-chart": "logical-down", "organisation-chart": "logical-down", org: "logical-down", "hierarchy-chart": "logical-down",
  tree: "catalog", treeview: "catalog", "tree-view": "catalog", "tree-diagram": "catalog", outline: "catalog",
  "mind-map": "mindmap", "both-side": "mindmap", "mindmap-horizontal": "mindmap", "vertical-mindmap": "mindmap-vertical",
  logical: "logical-right", right: "logical-right", "logical-structure": "logical-right", "right-growing": "logical-right", left: "logical-left",
  "timeline-vertical": "vertical-timeline", "flow-chart": "flowchart", "swim-lane": "swimlane", swimlanes: "swimlane",
  "swimlane-horizontal": "swimlane", "swimlane-vertical": "swimlane",
};
const REQUEST_KEYS = ["layoutType", "layout", "layoutStyle", "layoutName", "structure", "mapType", "mapLayout", "family", "type"];

const slug = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : "");

function pick(raw: Record<string, unknown>, keys: string[]): string {
  const params = asRecord(raw.params);
  const style = asRecord(raw.style);
  const mapLayout = asRecord(raw.mapLayout ?? params.mapLayout ?? style.mapLayout);
  for (const key of keys) {
    const value = slug(raw[key] ?? params[key] ?? style[key] ?? mapLayout[key]);
    if (value) return value;
  }
  return "";
}

export function rawMapValue(raw: Record<string, unknown>, key: string): unknown {
  const params = asRecord(raw.params);
  const style = asRecord(raw.style);
  const mapLayout = asRecord(raw.mapLayout ?? params.mapLayout ?? style.mapLayout);
  return raw[key] ?? params[key] ?? style[key] ?? mapLayout[key];
}

/** Hierarchy plus its options -> the matching internal layout id. */
function hierarchyLayout(raw: Record<string, unknown>): string {
  // Only the action's own options count: a stored layout also carries a `direction`, which must not leak into a new structure.
  const direction = pick(raw, ["layoutDirection", "direction"]);
  const growth = pick(raw, ["growthMode"]);
  const both = growth === "both-side" || growth === "both" || growth === "both-sides";
  if (both) return direction === "down" || direction === "up" ? "mindmap-vertical" : "mindmap";
  return direction === "left" ? "logical-left" : direction === "down" ? "logical-down" : direction === "up" ? "logical-up" : "logical-right";
}

/** Reads which structure a map action asks for, under any key or spelling the
 * model might use. `requested` is the raw text; `layout` is the internal id, or
 * "flowchart"/"swimlane" (undefined when nothing was asked, or the text names no
 * known layout). */
export function resolveLayoutRequest(raw: Record<string, unknown>): { requested?: string; layout?: string } {
  const params = asRecord(raw.params);
  const style = asRecord(raw.style);
  for (const key of REQUEST_KEYS) {
    const value = raw[key] ?? params[key] ?? style[key];
    const text = typeof value === "string" ? value : typeof asRecord(value).family === "string" ? String(asRecord(value).family) : "";
    if (!text.trim()) continue;
    const normalized = slug(text);
    let layout = ALIASES[normalized] ?? normalized;
    if (layout === "hierarchy") layout = hierarchyLayout(raw);
    else if (layout === "timeline" && ["down", "up"].includes(pick(raw, ["layoutDirection"]))) layout = "vertical-timeline";
    if (INTERNAL_LAYOUTS.has(layout) || layout === "flowchart" || layout === "swimlane") return { requested: text, layout };
    if (key !== "type" && key !== "family") return { requested: text };
  }
  return {};
}

/** The editor's name for a stored layout, e.g. "Hierarchy (Both side, Right)". */
export function editorLayoutName(layout: { family?: string; growthMode?: string; direction?: string } | undefined): string | undefined {
  if (!layout?.family) return undefined;
  const direction = layout.direction ? layout.direction[0].toUpperCase() + layout.direction.slice(1) : "Right";
  const family = layout.family === "orgchart" ? "hierarchy" : layout.family;
  if (family === "hierarchy") return `Hierarchy (${layout.growthMode === "both-side" ? "Both side" : "One side"}, ${direction})`;
  if (family === "treeview") return `Treeview (${direction})`;
  if (family === "timeline") return `Timeline (${direction})`;
  return family[0].toUpperCase() + family.slice(1);
}
