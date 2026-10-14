import { visibleRecords, type CollectionBlockPayload } from "@/app/workspace/collections/model";
import { relationIds } from "@/app/workspace/collections/collectionRelations";

/** Bounded schema + stable IDs + actual values; never send the entire large Collection to Dify. */
export function summarizeCollection(data: CollectionBlockPayload, limit = 16, query = "", viewId?: string) {
  const view = data.views.find((item) => item.id === (viewId ?? data.activeViewId)) ?? data.views[0];
  const rows = view ? visibleRecords(data, view, query).slice(0, Math.min(limit, 30)) : [];
  const fieldIds = new Set(data.fields.slice(0, 100).map((field) => field.id));
  return {
    collectionTitle: data.title.slice(0, 160),
    fields: data.fields.slice(0, 100).map((field) => ({
      id: field.id, name: field.name.slice(0, 160), type: field.type,
      relationFieldId: field.relationFieldId, targetFieldId: field.targetFieldId,
      relationMultiple: field.relationMultiple, rollupOperation: field.rollupOperation,
      formulaOperation: field.formulaOperation, formulaFieldIds: field.formulaFieldIds,
      ...(field.type === "select" ? { options: field.options?.slice(0, 60) } : {}),
    })),
    views: data.views.slice(0, 100).map((item) => ({
      id: item.id, name: item.name.slice(0, 160), kind: item.kind,
      groupFieldId: item.groupFieldId, dateFieldId: item.dateFieldId,
      endDateFieldId: item.endDateFieldId, filter: item.filter, sort: item.sort,
      filters: item.filters, sorts: item.sorts, filterLogic: item.filterLogic,
      aggregations: item.aggregations,
      galleryFieldIds: item.galleryFieldIds, formFieldIds: item.formFieldIds,
      formRequiredFieldIds: item.formRequiredFieldIds,
    })),
    activeViewId: data.activeViewId,
    selectedViewId: view?.id,
    recordCount: data.records.length,
    automations: (data.automations ?? []).slice(0, 20).map(rule => ({
      id: rule.id, name: rule.name.slice(0, 80), enabled: rule.enabled,
      whenFieldId: rule.whenFieldId, whenEquals: rule.whenEquals.slice(0, 80),
      thenFieldId: rule.thenFieldId, thenValue: rule.thenValue.slice(0, 80),
    })),
    records: rows.map((row) => ({ id: row.id, parentId: row.parentId,
      values: Object.fromEntries(Object.entries(row.values)
        .filter(([id]) => fieldIds.has(id)).map(([id, value]) => [id, value.slice(0, 400)])),
      relationDisplayValues: Object.fromEntries(data.fields.filter((field) => field.type === "relation").map((field) => {
        const ids = new Set(relationIds(row.values[field.id]));
        const primary = data.fields.find((candidate) => candidate.type === "text") ?? data.fields[0];
        const linked = data.records.filter(candidate => ids.has(candidate.id)).slice(0, 20);
        return [field.id, linked.map(candidate => candidate.values[primary?.id ?? ""] || "Untitled")
          .join(", ").slice(0, 400)];
      })),
      computedValues: Object.fromEntries(data.fields
        .filter((field) => field.type === "formula" || field.type === "lookup" || field.type === "rollup")
        .map((field) => [field.id, (row.values[field.id] ?? "").slice(0, 400)])),
    })),
    recordsTruncated: data.records.length > rows.length,
  };
}
