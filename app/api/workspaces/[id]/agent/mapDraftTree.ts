import type { JsonMap } from "./operationsTables";

const PARENT_KEYS = ["parentId", "parent", "parentKey", "parentRef", "parent_id", "parentText"] as const;
const IDENTITY_KEYS = ["id", "key", "ref", "text", "topic", "label", "title"] as const;

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function identities(draft: JsonMap): string[] {
  return IDENTITY_KEYS.map((key) => draft[key]).filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim().toLowerCase());
}

function parentHint(draft: JsonMap): string | undefined {
  for (const key of PARENT_KEYS) {
    const value = draft[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return undefined;
}

/**
 * Models describe a new map either as a nested tree (`children`) or as a flat
 * node list. The executor only understood the tree, so a flat list became
 * unconnected roots while the reply claimed a map was built. A flat list is
 * turned into a tree here: nodes naming a `parent` (by id, key or text) nest
 * under it, and a flat list with no hints at all means "first node is the
 * root, the rest are its children". Already-nested input is left untouched.
 */
export function normalizeMapDrafts(raw: JsonMap): JsonMap {
  const params = record(raw.params);
  const holder = Array.isArray(raw.nodes) ? raw : Array.isArray(params.nodes) ? params : undefined;
  if (!holder) return raw;
  const source: JsonMap[] = (holder.nodes as unknown[]).map((value) => (typeof value === "string" ? { text: value } : { ...record(value) }));
  if (source.length < 2 || source.some((draft) => Array.isArray(draft.children) && draft.children.length > 0)) return raw;

  const hinted = source.some((draft) => parentHint(draft) !== undefined);
  const roots: JsonMap[] = [];
  if (!hinted) {
    const [root, ...rest] = source;
    roots.push({ ...root, children: rest });
  } else {
    const byIdentity = new Map<string, JsonMap>();
    source.forEach((draft) => identities(draft).forEach((name) => { if (!byIdentity.has(name)) byIdentity.set(name, draft); }));
    source.forEach((draft) => {
      const hint = parentHint(draft);
      const parent = hint ? byIdentity.get(hint) : undefined;
      if (parent && parent !== draft) {
        parent.children = [...(Array.isArray(parent.children) ? parent.children as unknown[] : []), draft];
      } else {
        roots.push(draft);
      }
    });
    if (roots.length > 1) {
      // Still several roots after resolving hints: keep the first as the map
      // root and hang the other orphans under it rather than scattering them.
      const [root, ...orphans] = roots;
      root.children = [...(Array.isArray(root.children) ? root.children as unknown[] : []), ...orphans];
      roots.splice(0, roots.length, root);
    }
  }
  const nodes = roots;
  return holder === raw ? { ...raw, nodes } : { ...raw, params: { ...params, nodes } };
}

export function mapDraftSemanticIds(raw: JsonMap): string[] {
  const params = record(raw.params);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  const ids: string[] = [];
  const visit = (drafts: unknown[]) => drafts.forEach((value) => {
    const draft = record(value);
    if (typeof draft.id === "string" && draft.id.trim()) ids.push(draft.id.trim().toLowerCase());
    if (Array.isArray(draft.children)) visit(draft.children);
  });
  visit(nodes);
  return ids;
}
