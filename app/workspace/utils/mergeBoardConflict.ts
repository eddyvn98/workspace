/**
 * Three-way conflict resolution for Workspace REST saves. Ordinary blocks
 * remain atomic, while Collection blocks merge by stable record ID and field.
 * Never silently discard a concurrent edit to the same cell.
 */
export interface BoardContent {
  blocks: Record<string, unknown>;
  blockOrder: string[];
  connectors: Record<string, unknown>;
}
export interface MergeConflictItem {
  kind: "block" | "connector";
  id: string;
  mine: unknown;
  theirs: unknown;
}
export interface MergedBoardContent extends BoardContent {
  conflicts: number;
  items: MergeConflictItem[];
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : v);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
type Merged = { value: unknown; conflicts: number };

function choose(base: unknown, mine: unknown, theirs: unknown): Merged {
  if (same(mine, base)) return { value: theirs, conflicts: 0 };
  if (same(theirs, base) || same(mine, theirs)) return { value: mine, conflicts: 0 };
  return { value: theirs, conflicts: 1 };
}
function mergeProps(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>): { value: Record<string, unknown>; conflicts: number } {
  const value: Record<string, unknown> = {};
  let conflicts = 0;
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const result = choose(base[key], mine[key], theirs[key]);
    if (result.value !== undefined) value[key] = result.value;
    conflicts += result.conflicts;
  }
  return { value, conflicts };
}
function mergeRecord(base: unknown, mine: unknown, theirs: unknown): Merged {
  if (same(mine, base) || same(theirs, base) || same(mine, theirs)) return choose(base, mine, theirs);
  if (!base || !mine || !theirs) return choose(base, mine, theirs);
  const b = object(base), m = object(mine), t = object(theirs);
  const result = mergeProps({ ...b, values: undefined }, { ...m, values: undefined }, { ...t, values: undefined });
  const values = mergeProps(object(b.values), object(m.values), object(t.values));
  return { value: { ...result.value, values: values.value }, conflicts: result.conflicts + values.conflicts };
}
function mergeRecords(base: unknown[], mine: unknown[], theirs: unknown[]): Merged {
  const index = (items: unknown[]) => new Map(items.filter((r) => typeof object(r).id === "string").map((r) => [object(r).id as string, r]));
  const b = index(base), m = index(mine), t = index(theirs);
  const ids = [...new Set([...t.keys(), ...m.keys(), ...b.keys()])];
  const value: unknown[] = [];
  let conflicts = 0;
  for (const id of ids) {
    const merged = mergeRecord(b.get(id), m.get(id), t.get(id));
    if (merged.value !== undefined) value.push(merged.value);
    conflicts += merged.conflicts;
  }
  return { value, conflicts };
}
function isCollection(value: unknown): boolean {
  const b = object(value), d = object(b.data);
  return b.type === "collection" && d.version === 1 &&
    Array.isArray(d.records) && Array.isArray(d.fields) && Array.isArray(d.views);
}
function mergeAuditTrail(mine: unknown, theirs: unknown): unknown[] {
  const entries = new Map<string, Record<string, unknown>>();
  for (const candidate of [...(Array.isArray(theirs) ? theirs : []), ...(Array.isArray(mine) ? mine : [])]) {
    const item = object(candidate);
    if (typeof item.id === "string" && !entries.has(item.id)) entries.set(item.id, item);
  }
  return [...entries.values()].sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0)).slice(0, 120);
}
function mergeCollectionBlock(base: unknown, mine: unknown, theirs: unknown): Merged {
  if (![base, mine, theirs].every(isCollection)) return choose(base, mine, theirs);
  const b = object(base), m = object(mine), t = object(theirs);
  const props = mergeProps({ ...b, data: undefined }, { ...m, data: undefined }, { ...t, data: undefined });
  const bd = object(b.data), md = object(m.data), td = object(t.data);
  const meta = mergeProps({ ...bd, records: undefined, auditTrail: undefined },
    { ...md, records: undefined, auditTrail: undefined },
    { ...td, records: undefined, auditTrail: undefined });
  const records = mergeRecords(bd.records as unknown[], md.records as unknown[], td.records as unknown[]);
  return {
    value: { ...props.value, data: { ...meta.value, records: records.value,
      auditTrail: mergeAuditTrail(md.auditTrail, td.auditTrail) } },
    conflicts: props.conflicts + meta.conflicts + records.conflicts,
  };
}
function mergeEntities(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>, kind: "block" | "connector") {
  const merged: Record<string, unknown> = {};
  const lost: MergeConflictItem[] = [];
  let conflicts = 0;
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const local = !same(mine[key], base[key]);
    const remote = !same(theirs[key], base[key]);
    let result: Merged;
    if (!local) result = { value: theirs[key], conflicts: 0 };
    else if (!remote) result = { value: mine[key], conflicts: 0 };
    else result = kind === "block" ? mergeCollectionBlock(base[key], mine[key], theirs[key]) : choose(base[key], mine[key], theirs[key]);
    if (result.value !== undefined) merged[key] = result.value;
    conflicts += result.conflicts;
    if (result.conflicts) lost.push({ kind, id: key, mine: mine[key], theirs: theirs[key] });
  }
  return { merged, conflicts, lost };
}
export function mergeBoardContent(base: BoardContent, mine: BoardContent, theirs: BoardContent): MergedBoardContent {
  const blocks = mergeEntities(base.blocks, mine.blocks, theirs.blocks, "block");
  const connectors = mergeEntities(base.connectors, mine.connectors, theirs.connectors, "connector");
  const order = [...new Set([...theirs.blockOrder, ...mine.blockOrder, ...Object.keys(blocks.merged)])]
    .filter((id) => id in blocks.merged);
  return {
    blocks: blocks.merged,
    blockOrder: order,
    connectors: connectors.merged,
    conflicts: blocks.conflicts + connectors.conflicts,
    items: [...blocks.lost, ...connectors.lost],
  };
}
