import { visibleRecords, type CollectionBlockPayload } from "@/app/workspace/collections/model";

/** Bounded schema + stable IDs + actual values; never send the entire large Collection to Dify. */
export function summarizeCollection(data: CollectionBlockPayload, limit = 16, query = "", viewId?: string) {
  const view = data.views.find((item) => item.id === (viewId ?? data.activeViewId)) ?? data.views[0];
  const rows = view ? visibleRecords(data, view, query).slice(0, Math.min(limit, 30)) : [];
  const fieldIds = new Set(data.fields.slice(0, 100).map((field) => field.id));
  return {
    collectionTitle: data.title.slice(0, 160),
    fields: data.fields.slice(0, 100).map((field) => ({
      id: field.id, name: field.name.slice(0, 160), type: field.type,
      ...(field.type === "select" ? { options: field.options?.slice(0, 60) } : {}),
    })),
    views: data.views.slice(0, 100).map((item) => ({
      id: item.id, name: item.name.slice(0, 160), kind: item.kind,
      groupFieldId: item.groupFieldId, dateFieldId: item.dateFieldId,
      endDateFieldId: item.endDateFieldId, filter: item.filter, sort: item.sort,
      filters: item.filters, sorts: item.sorts, filterLogic: item.filterLogic,
    })),
    activeViewId: data.activeViewId,
    selectedViewId: view?.id,
    recordCount: data.records.length,
    records: rows.map((row) => ({ id: row.id, parentId: row.parentId,
      values: Object.fromEntries(Object.entries(row.values)
        .filter(([id]) => fieldIds.has(id)).map(([id, value]) => [id, value.slice(0, 400)])) })),
    recordsTruncated: data.records.length > rows.length,
  };
}
