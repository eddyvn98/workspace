import type { WorkspaceJson } from "./contracts";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => String(value ?? "").slice(0, max);
const valueMap = (value: unknown): WorkspaceJson => Object.fromEntries(
  Object.entries(record(value)).slice(0, 100).map(([key, item]) => [key.slice(0, 128), text(item, 400)]));

/**
 * summarizeCollection already bounds a read to 100 fields and 30 rows. The generic compaction
 * caps every array at 8 items, which silently dropped fields 9+ (and their values, including
 * formula/lookup projections) from the Workspace-verified read result.
 */
export function compactCollectionReadResult(value: unknown): WorkspaceJson {
  const data = record(value);
  return {
    fields: (Array.isArray(data.fields) ? data.fields : []).slice(0, 100).map((raw) => {
      const field = record(raw);
      return { id: text(field.id, 128), name: text(field.name, 160), type: text(field.type, 32) };
    }),
    records: (Array.isArray(data.records) ? data.records : []).slice(0, 30).map((raw) => {
      const row = record(raw);
      return { id: text(row.id, 128), values: valueMap(row.values),
        dependsOn: (Array.isArray(row.dependsOn) ? row.dependsOn : []).slice(0, 20).map(id => text(id, 128)),
        computedValues: valueMap(row.computedValues), relationDisplayValues: valueMap(row.relationDisplayValues) };
    }),
  };
}
