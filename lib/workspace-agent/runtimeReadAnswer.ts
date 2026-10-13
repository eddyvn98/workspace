import type { WorkspaceJson, WorkspaceRuntimeReceipt } from "./contracts";
import { getWorkspaceResponseLanguageInstruction } from "@/app/workspace/utils/workspaceChatRequest";

function object(value: unknown): WorkspaceJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
}

/** Allowlist of real record IDs returned by Workspace, not by Dify's prose. */
export function verifiedCollectionRecordIds(readResults: WorkspaceJson[]): string[] {
  const ids = new Set<string>();
  for (const item of readResults) {
    if (!["read_collection", "search_collection_records"].includes(String(item.actionType))) continue;
    const rows = object(item.result).records;
    if (!Array.isArray(rows)) continue;
    for (const raw of rows) {
      const id = object(raw).id;
      if (typeof id === "string" && id.length > 0 && id.length <= 128) ids.add(id);
    }
  }
  return [...ids];
}

/** Read evidence comes only from the Workspace executor, never model text. */
export function verifiedCollectionReadAnswer(readResults: WorkspaceJson[], query: string): string {
  const language = getWorkspaceResponseLanguageInstruction(query);
  const summaries: string[] = [];
  const seen = new Set<string>();
  for (const item of readResults) {
    const type = String(item.actionType ?? "");
    if (type !== "read_collection" && type !== "search_collection_records") continue;
    const data = object(item.result);
    const records = Array.isArray(data.records) ? data.records : [];
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const names = new Map<string, string>();
    fields.forEach((raw, index) => {
      const field = object(raw);
      if (typeof field.id !== "string") return;
      const name = typeof field.name === "string" && field.name.trim() ? field.name.trim() : `Field ${index + 1}`;
      // Repeated labels are disambiguated without exposing internal field IDs.
      const duplicates = fields.slice(0, index).filter((other) => object(other).name === field.name).length;
      names.set(field.id, duplicates ? `${name} (${duplicates + 1})` : name);
    });
    const sample = records.slice(0, 5).map((raw) => {
      const row = object(raw);
      const values: WorkspaceJson = {};
      for (const [fieldId, value] of Object.entries(object(row.values)).slice(0, 8)) {
        const label = names.get(fieldId);
        if (!label) continue; // Unknown field IDs must not be mislabeled or exposed.
        values[label] = String(value ?? "").slice(0, 160);
      }
      const stableId = typeof row.id === "string" && row.id.trim() ? row.id : null;
      return { id: stableId, values };
    });
    const reference = typeof item.query === "string" ? item.query.slice(0, 200) : "";
    const dedupeKey = JSON.stringify([type, item.blockId, reference, sample, records.length]);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const rows = sample.map((row) => `Record ID: ${row.id ?? "(missing stable ID)"}; Fields: ${JSON.stringify(row.values)}`).join("; ");
    const description = `${type}${reference ? ` (${JSON.stringify(reference)})` : ""}: ${records.length} record(s) returned; ${rows || "no records"}`;
    summaries.push(description.slice(0, 1700));
  }
  if (!summaries.length) return "";
  const heading = language === "Vietnamese"
    ? "Kết quả đọc Collection do Workspace xác nhận (không ghi dữ liệu):"
    : "Workspace-verified Collection read result (no data mutation):";
  return `${heading}\n${summaries.slice(0, 4).join("\n")}`;
}

/** Preserve confirmed reads across model rounds, even when final actions=[]. */
export function completedWorkspaceAnswer(
  receipts: WorkspaceRuntimeReceipt[],
  fallback: string,
  query: string,
  readResults: WorkspaceJson[],
): string {
  const summaries = receipts.filter((item) => item.persisted && item.summary).map((item) => item.summary!);
  const readAnswer = verifiedCollectionReadAnswer(readResults, query);
  const versionReceipt = receipts.find((item) => item.persisted && item.actionType === "create_version" && item.summary);
  if (versionReceipt?.summary && receipts.filter((item) => item.persisted).length === 1 && !readAnswer) {
    return versionReceipt.summary.replace(/^create_version:\s*/, "");
  }
  const language = getWorkspaceResponseLanguageInstruction(query);
  const writeAnswer = summaries.length
    ? language === "Vietnamese"
      ? `Đã lưu các thay đổi trong Workspace: ${summaries.join("; ")}.`
      : `Workspace changes were saved: ${summaries.join("; ")}.`
    : "";
  return [writeAnswer, readAnswer].filter(Boolean).join("\n\n") || fallback || "Done.";
}
