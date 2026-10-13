/** Structural equality that is blind to object key insertion order.
 *
 *  A plain `JSON.stringify(a) === JSON.stringify(b)` treats
 *  `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` as different, because
 *  `JSON.stringify` emits keys in insertion order. That is a false
 *  negative whenever one side round-tripped through something that does
 *  not preserve insertion order (notably Postgres JSONB, which can come
 *  back with a different key order than it was written with) while the
 *  other side is the in-memory object built by the editor. Object keys are
 *  sorted recursively before stringifying so two objects with the same
 *  keys/values compare equal regardless of order; array order is preserved
 *  since it is semantically meaningful (block order, connector waypoints). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) result[key] = canonicalize(record[key]);
    return result;
  }
  return value;
}

export function canonicalDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}
