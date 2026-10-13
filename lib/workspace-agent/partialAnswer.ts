import type { WorkspaceRuntimeReceipt } from "./contracts";
import { getWorkspaceResponseLanguageInstruction } from "@/app/workspace/utils/workspaceChatRequest";

function actionLabel(type: string, language: string): string {
  const labels: Record<string, { Vietnamese: string; English: string }> = {
    update_table_cell: { Vietnamese: "sửa ô", English: "edit a cell" }, // vi-allow: translated action label
    update_table_cells: { Vietnamese: "sửa các ô", English: "edit cells" }, // vi-allow: translated action label
    paste_table_range: { Vietnamese: "dán vùng dữ liệu", English: "paste a range" }, // vi-allow: translated action label
  };
  const label = labels[type];
  if (!label) return type;
  if (language === "Vietnamese" || language === "English") return label[language];
  return type;
}

export function partialAnswer(applied: number, query: string, receipts: WorkspaceRuntimeReceipt[] = []): string {
  const language = getWorkspaceResponseLanguageInstruction(query);
  const failedTypes = [...new Set(receipts.filter((item) => !item.persisted).map((item) => item.actionType))];
  const reason = receipts.find((item) => !item.persisted && item.reason)?.reason ?? "";
  const rejectedTypes = reason.match(/could not be applied:\s*([^.]+)/i)?.[1]
    .split(",")
    .map((type) => type.trim())
    .filter((type) => failedTypes.includes(type as WorkspaceRuntimeReceipt["actionType"])) ?? failedTypes;
  const otherFailedTypes = failedTypes.filter((type) => !rejectedTypes.includes(type));
  const targetFailure = /no target matched|target.*not found/i.test(reason);
  // vi-allow: runtime-owned status copy follows the existing Workspace language heuristic.
  if (language === "Vietnamese") {
    if (failedTypes.length) {
      const rejected = rejectedTypes.map((type) => actionLabel(type, language)).join(", ");
      const alsoFailed = otherFailedTypes.map((type) => actionLabel(type, language)).join(", ");
      const cause = targetFailure ? " vì không tìm thấy đích hợp lệ hoặc thiếu tham số" : ""; // vi-allow: translated runtime status
      const rollback = alsoFailed ? ` Các thao tác ${alsoFailed} trong cùng lượt cũng không được lưu.` : ""; // vi-allow: translated runtime status
      return applied > 0
        ? `Một phần thay đổi trước đó đã được lưu. Thao tác ${rejected} thất bại${cause}; kiểm tra các mục chưa xử lý trước khi thử lại.` // vi-allow: translated runtime status
        : `Không có thao tác nào được lưu. Thao tác ${rejected} thất bại${cause}.${rollback} Hãy kiểm tra bảng trước khi thử lại.`; // vi-allow: translated runtime status
    }
    return applied > 0
      ? "Một phần thay đổi đã được lưu, nhưng tôi chưa xác nhận được phần còn lại. Hãy kiểm tra các mục chưa xử lý trước khi thử lại." // vi-allow: translated runtime status
      : "Tôi chưa xác nhận được thay đổi nào đã lưu. Hãy kiểm tra bảng trước khi thử lại."; // vi-allow: translated runtime status
  }
  if (failedTypes.length) {
    const rejected = rejectedTypes.map((type) => actionLabel(type, language)).join(", ");
    const alsoFailed = otherFailedTypes.map((type) => actionLabel(type, language)).join(", ");
    const cause = targetFailure ? " because the target could not be found or a parameter was missing" : "";
    const rollback = alsoFailed ? ` The ${alsoFailed} action(s) in the same batch were also not saved.` : "";
    return applied > 0
      ? `Some earlier changes were saved. The ${rejected} action failed${cause}; review the unresolved items before retrying.`
      : `No actions were saved. The ${rejected} action failed${cause}.${rollback} Review the board before retrying.`;
  }
  return applied > 0
    ? "Some changes were saved, but I could not confirm the rest of the request. Review the unresolved items before retrying."
    : "I could not confirm a saved change for this request. Please review the board before trying again.";
}
