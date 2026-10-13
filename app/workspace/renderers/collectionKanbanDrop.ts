import { setRecordValue, type CollectionBlockPayload } from "../collections/model";

/** Pure state transition; saving and conflict arbitration remain in the existing REST path. */
export function dropCollectionCard(data: CollectionBlockPayload, recordId: string, fieldId: string | undefined,
  status: string, readOnly: boolean): CollectionBlockPayload {
  if (readOnly || !fieldId) return data;
  const group = data.fields.find(field => field.id === fieldId && field.type === "select");
  const record = data.records.find(item => item.id === recordId);
  if (!group || !record || !(status === "" || group.options?.includes(status))) return data;
  if ((record.values[fieldId] ?? "") === status) return data;
  return setRecordValue(data, recordId, fieldId, status);
}
