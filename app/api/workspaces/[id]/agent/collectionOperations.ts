import { fromTableBlock } from "@/app/workspace/collections/io";
import { deleteRecord, recordTitle, removeField, removeView, updateField, updateView, type CollectionBlockPayload, type CollectionField, type CollectionView } from "@/app/workspace/collections/model";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { validateCollectionAction, validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
import { COLLECTION_COMMANDS, COLLECTION_READ_COMMANDS } from "@/lib/workspace-agent/collectionActionSchema";
import type { AgentBoardState } from "./operationsCore";
import { now, record } from "./operationsCore";
import type { JsonMap } from "./operationsTables";

type Result = { ids: string[]; operation: string; reason?: string; summary?: string };
const str = (v: unknown) => String(v ?? "");
const prop = (raw: JsonMap, key: string) => raw[key] ?? record(raw.params)[key];

/** Collection mutation is an ordinary board operation: commits/revisions/receipts stay in the existing route. */
export function applyCollectionAction(state: AgentBoardState, raw: JsonMap): Result | null {
  const type = str(raw.type);
  if (!COLLECTION_COMMANDS.has(type) || COLLECTION_READ_COMMANDS.has(type)) return null;
  const blockId = str(prop(raw, "blockId"));
  const block = state.blocks[blockId];
  const rejected = (reason: string): Result => ({ ids: [], operation: type, reason });
  const canonical = { ...raw, blockId };
  const schemaIssue = validateCollectionAction(canonical);
  if (schemaIssue) return rejected(schemaIssue);
  const targetIssue = validateCollectionTarget(canonical, { blocks: state.blocks });
  if (targetIssue) return rejected(targetIssue);
  if (!block) return rejected("Collection block not found.");

  if (type === "convert_table_to_collection") {
    block.data = fromTableBlock(block as unknown as CanvasBlock<"table">) as unknown as JsonMap;
    block.type = "collection";
    block.updatedAt = now();
    return { ids: [blockId], operation: type, summary: "Converted table to Collection" };
  }
  const data = block.data as unknown as CollectionBlockPayload;
  const recordId = str(prop(raw, "recordId"));
  const fieldId = str(prop(raw, "fieldId"));
  const viewId = str(prop(raw, "viewId"));
  let next = data;
  let confirmedSummary: string | undefined;
  if (type === "create_collection_record") {
    next = { ...data, records: [...data.records, { id: recordId, values: prop(raw, "values") as Record<string, string> }] };
  } else if (type === "update_collection_record") {
    const values = prop(raw, "values") as Record<string, string>;
    next = { ...data, records: data.records.map((r) => r.id === recordId ? { ...r, values: { ...r.values, ...values } } : r) };
  } else if (type === "delete_collection_record") {
    const recordToDelete = data.records.find((item) => item.id === recordId);
    if (recordToDelete) {
      const title = recordTitle(data, recordToDelete).trim().replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 160);
      // The label comes from the pre-delete persisted record, never the model claim.
      if (title && title !== "Untitled") confirmedSummary = `deleted Collection record ${JSON.stringify(title)}`;
    }
    next = deleteRecord(data, recordId);
  } else if (type === "add_collection_field") {
    const typeValue = str(prop(raw, "fieldType")) as CollectionField["type"];
    const field: CollectionField = { id: fieldId, name: str(prop(raw, "name")).trim(), type: typeValue,
      ...(typeValue === "select" ? { options: prop(raw, "options") as string[] ?? [] } : {}) };
    next = { ...data, fields: [...data.fields, field] };
  } else if (type === "update_collection_field") {
    const patch: Partial<CollectionField> = {};
    if (prop(raw, "name") !== undefined) patch.name = str(prop(raw, "name")).trim();
    if (prop(raw, "fieldType") !== undefined) patch.type = str(prop(raw, "fieldType")) as CollectionField["type"];
    if (prop(raw, "options") !== undefined) patch.options = prop(raw, "options") as string[];
    next = updateField(data, fieldId, patch);
  } else if (type === "remove_collection_field") {
    next = removeField(data, fieldId);
  } else if (type === "add_collection_view") {
    const view: CollectionView = { id: viewId, name: str(prop(raw, "name")).trim(), kind: str(prop(raw, "kind")) as CollectionView["kind"] };
    next = { ...data, views: [...data.views, view] };
  } else if (type === "configure_collection_view") {
    const patch: Partial<CollectionView> = {};
    for (const key of ["name", "groupFieldId", "dateFieldId", "endDateFieldId", "filter", "sort"] as const) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) Object.assign(patch, { [key]: raw[key] ?? undefined });
    }
    next = updateView(data, viewId, patch);
    if (prop(raw, "active") === true) next = { ...next, activeViewId: viewId };
  } else if (type === "remove_collection_view") {
    next = removeView(data, viewId);
  }
  if (JSON.stringify(next) === JSON.stringify(data)) return rejected("Collection command made no changes.");
  block.data = next as unknown as JsonMap;
  block.updatedAt = now();
  return { ids: [blockId], operation: type, summary: confirmedSummary ?? `${type} (${recordId || fieldId || viewId || blockId})` };
}
