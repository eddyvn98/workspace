import type { CollectionBlockPayload, CollectionRecord } from "./model";

const DAY = 86400000;
const dateMs = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
};
const iso = (value: number) => new Date(value).toISOString().slice(0, 10);

export function validCollectionDependencies(data: CollectionBlockPayload, recordId: string,
  dependencies: string[]): boolean {
  if (!data.records.some(row => row.id === recordId) || dependencies.length > 20 ||
    new Set(dependencies).size !== dependencies.length) return false;
  const index = new Map(data.records.map(row => [row.id, row]));
  for (const dependency of dependencies) {
    if (!index.has(dependency) || dependency === recordId) return false;
    const visited = new Set<string>();
    const stack = [dependency];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === recordId) return false;
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push(...(index.get(id)?.dependsOn ?? []));
    }
  }
  return true;
}
export function setCollectionDependencies(data: CollectionBlockPayload, recordId: string,
  dependencies: string[]): CollectionBlockPayload {
  if (!validCollectionDependencies(data, recordId, dependencies)) return data;
  const record = data.records.find(item => item.id === recordId);
  if (JSON.stringify(record?.dependsOn ?? []) === JSON.stringify(dependencies)) return data;
  return { ...data, records: data.records.map(item => item.id === recordId
    ? { ...item, dependsOn: dependencies } : item) };
}
/** Deterministic finish-to-start scheduling; preserves duration and does not
 * move tasks earlier than the user's existing dates. Missing dates are skipped. */
export function scheduleCollectionDependencies(data: CollectionBlockPayload,
  startFieldId?: string, endFieldId?: string): CollectionBlockPayload {
  if (!startFieldId || !data.fields.some(field => field.id === startFieldId && field.type === "date")) return data;
  const rows = new Map(data.records.map(row => [row.id, row]));
  const visited = new Set<string>(), visiting = new Set<string>(), ordered: CollectionRecord[] = [];
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const row = rows.get(id);
    if (!row) return false;
    visiting.add(id);
    for (const dependency of row.dependsOn ?? []) {
      if (!walk(dependency)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(row);
    return true;
  };
  for (const row of data.records) if (!walk(row.id)) return data;
  const result = new Map<string, CollectionRecord>();
  let changed = false;
  for (const record of ordered) {
    let latestEnd: number | null = null;
    for (const id of record.dependsOn ?? []) {
      const predecessor = result.get(id)!;
      const ending = dateMs(predecessor.values[endFieldId ?? ""] || predecessor.values[startFieldId] || "");
      if (ending !== null) latestEnd = Math.max(latestEnd ?? ending, ending);
    }
    const start = dateMs(record.values[startFieldId] || "");
    if (latestEnd === null || start === null || start > latestEnd) {
      result.set(record.id, record);
      continue;
    }
    const offset = latestEnd + DAY - start;
    const values = { ...record.values, [startFieldId]: iso(start + offset) };
    const end = dateMs(record.values[endFieldId ?? ""] || "");
    if (endFieldId && endFieldId !== startFieldId && end !== null) {
      values[endFieldId] = iso(end + offset);
    }
    result.set(record.id, { ...record, values });
    changed = true;
  }
  return changed ? { ...data, records: data.records.map(row => result.get(row.id) ?? row) } : data;
}
