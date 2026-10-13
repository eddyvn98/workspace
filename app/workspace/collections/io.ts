import Papa from "papaparse";
import type { CanvasBlock } from "../types/block";
import { createCollection, newId, normalizeCollection, type CollectionBlockPayload, type CollectionField, type CollectionRecord } from "./model";
import { projectCollectionLookups } from "./collectionRelations";
import { projectCollectionFormulas } from "./collectionFormula";

export function fromTableBlock(block: CanvasBlock<"table">): CollectionBlockPayload {
  const data = createCollection();
  const table = block.data;
  const count = Math.max(0, Math.min(table.cols, 50));
  const first = table.headerRow ? 1 : 0;
  const fields: CollectionField[] = Array.from({ length: count }, (_, column) => {
    const type = table.columnTypes?.[column];
    const selectOptions = table.columnSelectOptions?.[column] ?? [];
    return {
      id: newId(),
      name: (table.headerRow ? table.cells?.[0]?.[column] : "")?.trim() || "Column " + (column + 1),
      type: type === "date" || type === "number" || type === "select" ? type : "text",
      ...(type === "select" ? { options: selectOptions.map((o) => o.label) } : {}),
    };
  });
  if (!fields.length) return data;
  const records: CollectionRecord[] = Array.from({ length: Math.max(0, Math.min(table.rows, 5000) - first) }, (_, row) => {
    const values: Record<string, string> = {};
    fields.forEach((field, index) => {
      const raw = String(table.cells?.[row + first]?.[index] ?? "");
      const choice = table.columnSelectOptions?.[index]?.find((o) => o.id === raw);
      values[field.id] = choice?.label ?? raw;
    });
    return { id: newId(), values };
  }).filter((r) => Object.values(r.values).some((v) => v.trim()));
  const status = fields.find((f) => f.type === "select");
  const dates = fields.filter((f) => f.type === "date");
  return { ...data, title: "Collection from table", fields, records,
    views: data.views.map((v) => ({
      ...v,
      ...(v.kind === "kanban" ? { groupFieldId: status?.id } : {}),
      ...(v.kind === "calendar" || v.kind === "timeline" ? { dateFieldId: dates[0]?.id, endDateFieldId: dates[1]?.id ?? dates[0]?.id } : {}),
    })),
  };
}
export function importCollectionCsv(text: string): CollectionBlockPayload {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { delimiter: ",", skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error("Invalid CSV: " + parsed.errors[0].message);
  const rows = (parsed.data ?? []).slice(0, 5001);
  if (!rows.length || !rows[0].length) throw new Error("CSV is empty");
  const header = rows[0].slice(0, 50);
  const fields: CollectionField[] = header.map((name, i) => ({ id: newId(), name: String(name).trim() || "Column " + (i + 1), type: "text" }));
  const records = rows.slice(1).map((row) => ({
    id: newId(),
    values: Object.fromEntries(fields.map((f, i) => [f.id, String(row[i] ?? "")])),
  }));
  return { ...createCollection(), title: "Imported CSV", fields, records };
}
function csvValue(v: string): string {
  // Prevent spreadsheet formula injection when opening exports in Excel.
  const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function exportCollectionCsv(data: CollectionBlockPayload): string {
  return [data.fields.map((f) => csvValue(f.name)).join(","),
    ...data.records.map((r) => {
      const computed = projectCollectionFormulas(data, projectCollectionLookups(data, r));
      return data.fields.map((f) => csvValue(computed.values[f.id] ?? "")).join(",");
    })].join("\r\n");
}
export function importCollectionJson(text: string): CollectionBlockPayload {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid collection JSON");
  const value = raw as Partial<CollectionBlockPayload>;
  if (value.version !== 1 || !Array.isArray(value.fields) || !Array.isArray(value.records) || !Array.isArray(value.views)) {
    throw new Error("Unsupported collection format");
  }
  if (value.fields.length > 100 || value.records.length > 5000 || value.views.length > 100) throw new Error("Collection exceeds import limits");
  const fields = value.fields;
  const records = value.records;
  if (!fields.every((f) => f && typeof f.id === "string" && typeof f.name === "string" && typeof f.type === "string")
    || !records.every((r) => r && typeof r.id === "string" && r.values && typeof r.values === "object")) {
    throw new Error("Invalid collection fields or records");
  }
  return normalizeCollection(value as CollectionBlockPayload);
}
export function downloadCollection(filename: string, content: string, type: string): void {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
