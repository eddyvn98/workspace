const EMBEDDED_TABLE_V2_KEY = "__tableV2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Keep the additive V2 model inside the existing JSON column. */
export function encodePersistedTable(table: unknown, tableV2: unknown): Record<string, unknown> | null {
  const legacy = isRecord(table) ? { ...table } : {};
  if (tableV2 === undefined) return Object.keys(legacy).length > 0 ? legacy : null;
  return { ...legacy, [EMBEDDED_TABLE_V2_KEY]: tableV2 };
}

/** Read both legacy tables and the additive V2 table from the same column. */
export function decodePersistedTable(value: unknown): {
  table?: Record<string, unknown>;
  tableV2?: Record<string, unknown>;
} {
  if (!isRecord(value)) return {};
  const embeddedV2 = value[EMBEDDED_TABLE_V2_KEY];
  if (isRecord(embeddedV2)) {
    const legacy = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== EMBEDDED_TABLE_V2_KEY),
    );
    return {
      ...(Object.keys(legacy).length > 0 ? { table: legacy } : {}),
      tableV2: embeddedV2,
    };
  }
  if (value.version === 2) return { tableV2: value };
  return { table: value };
}
