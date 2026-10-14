import { applyCollectionAutomations } from "@/app/workspace/collections/collectionAutomations";
import { fromTableBlock } from "@/app/workspace/collections/io";
import { deleteRecord, recordTitle, removeField, removeView, updateField, updateView, type CollectionBlockPayload, type CollectionField, type CollectionView } from "@/app/workspace/collections/model";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { normalizeCollectionValue, validateCollectionAction, validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
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
  const display = (value: string) => JSON.stringify(value.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 120));
  const normalizedValues = () => Object.fromEntries(Object.entries(prop(raw, "values") as Record<string, unknown>)
    .map(([id, value]) => [id, normalizeCollectionValue(value)!]));
  if (type === "create_collection_record") {
    const values = normalizedValues();
    next = { ...data, records: [...data.records,
      applyCollectionAutomations(data, null, { id: recordId, values }, Object.keys(values))] };
  } else if (type === "update_collection_record") {
    const values = normalizedValues();
    next = { ...data, records: data.records.map((r) => r.id === recordId
      ? applyCollectionAutomations(data, r, { ...r, values: { ...r.values, ...values } }, Object.keys(values)) : r) };
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
      ...(typeValue === "select" ? { options: prop(raw, "options") as string[] ?? [] } : {}),
      ...(typeValue === "lookup" || typeValue === "rollup" ? { relationFieldId: str(prop(raw, "relationFieldId")),
        targetFieldId: str(prop(raw, "targetFieldId")) } : {}),
      ...(typeValue === "relation" ? { relationMultiple: prop(raw, "relationMultiple") === true } : {}),
      ...(typeValue === "rollup" ? { rollupOperation: str(prop(raw, "rollupOperation")) as CollectionField["rollupOperation"] } : {}),
      ...(typeValue === "formula" ? { formulaOperation: prop(raw, "formulaOperation") as CollectionField["formulaOperation"],
        formulaFieldIds: prop(raw, "formulaFieldIds") as string[] } : {}) };
    next = { ...data, fields: [...data.fields, field] };
  } else if (type === "update_collection_field") {
    const patch: Partial<CollectionField> = {};
    if (prop(raw, "name") !== undefined) patch.name = str(prop(raw, "name")).trim();
    if (prop(raw, "fieldType") !== undefined) patch.type = str(prop(raw, "fieldType")) as CollectionField["type"];
    if (prop(raw, "options") !== undefined) patch.options = prop(raw, "options") as string[];
    if (prop(raw, "relationMultiple") !== undefined) patch.relationMultiple = prop(raw, "relationMultiple") === true;
    if (prop(raw, "rollupOperation") !== undefined) patch.rollupOperation = str(prop(raw, "rollupOperation")) as CollectionField["rollupOperation"];
    if (prop(raw, "relationFieldId") !== undefined) patch.relationFieldId = str(prop(raw, "relationFieldId"));
    if (prop(raw, "targetFieldId") !== undefined) patch.targetFieldId = str(prop(raw, "targetFieldId"));
    if (prop(raw, "formulaOperation") !== undefined) patch.formulaOperation = prop(raw, "formulaOperation") as CollectionField["formulaOperation"];
    if (prop(raw, "formulaFieldIds") !== undefined) patch.formulaFieldIds = prop(raw, "formulaFieldIds") as string[];
    next = updateField(data, fieldId, patch);
  } else if (type === "remove_collection_field") {
    next = removeField(data, fieldId);
  } else if (type === "add_collection_view") {
    const view: CollectionView = { id: viewId, name: str(prop(raw, "name")).trim(), kind: str(prop(raw, "kind")) as CollectionView["kind"] };
    next = { ...data, views: [...data.views, view] };
  } else if (type === "configure_collection_view") {
    const patch: Partial<CollectionView> = {};
    for (const key of ["name", "groupFieldId", "dateFieldId", "endDateFieldId", "filter", "sort", "filters", "sorts", "filterLogic", "aggregations", "galleryFieldIds", "formFieldIds", "formRequiredFieldIds"] as const) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) Object.assign(patch, { [key]: raw[key] ?? undefined });
    }
    // Test the submitted keys, not the patch keys mutated above: otherwise
    // setting a new plural config would immediately clear itself.
    if (Object.prototype.hasOwnProperty.call(raw, "filters")) patch.filter = undefined;
    else if (Object.prototype.hasOwnProperty.call(raw, "filter")) patch.filters = undefined;
    if (Object.prototype.hasOwnProperty.call(raw, "sorts")) patch.sort = undefined;
    else if (Object.prototype.hasOwnProperty.call(raw, "sort")) patch.sorts = undefined;
    next = updateView(data, viewId, patch);
    if (prop(raw, "active") === true) next = { ...next, activeViewId: viewId };
  } else if (type === "remove_collection_view") {
    next = removeView(data, viewId);
  }
  if (!confirmedSummary) {
    const savedRecord = next.records.find((item) => item.id === recordId);
    const oldRecord = data.records.find((item) => item.id === recordId);
    const savedField = next.fields.find((item) => item.id === fieldId);
    const oldField = data.fields.find((item) => item.id === fieldId);
    const savedView = next.views.find((item) => item.id === viewId);
    const oldView = data.views.find((item) => item.id === viewId);
    if (type === "create_collection_record" && savedRecord) confirmedSummary = `created Collection record ${display(recordTitle(next, savedRecord))}`;
    if (type === "update_collection_record" && savedRecord) {
      const changes = Object.entries(normalizedValues()).slice(0, 5).map(([id, value]) => {
        const field = next.fields.find((item) => item.id === id);
        return field ? `${field.name.slice(0, 80)} = ${display(value)}` : "";
      }).filter(Boolean).join(", ");
      confirmedSummary = `updated Collection record ${display(recordTitle(next, oldRecord ?? savedRecord))}: ${changes}`;
    }
    if (type === "add_collection_field" && savedField) confirmedSummary = `added Collection field ${display(savedField.name)}`;
    if (type === "update_collection_field" && savedField) confirmedSummary = `updated Collection field ${display(savedField.name)}`;
    if (type === "remove_collection_field" && oldField) confirmedSummary = `removed Collection field ${display(oldField.name)}`;
    if (type === "add_collection_view" && savedView) confirmedSummary = `added Collection view ${display(savedView.name)}`;
    if (type === "configure_collection_view" && savedView) confirmedSummary = `configured Collection view ${display(savedView.name)}`;
    if (type === "remove_collection_view" && oldView) confirmedSummary = `removed Collection view ${display(oldView.name)}`;
  }
  if (JSON.stringify(next) === JSON.stringify(data)) return rejected("Collection command made no changes.");
  block.data = next as unknown as JsonMap;
  block.updatedAt = now();
  return { ids: [blockId], operation: type, summary: confirmedSummary ?? `${type} (${recordId || fieldId || viewId || blockId})` };
}
