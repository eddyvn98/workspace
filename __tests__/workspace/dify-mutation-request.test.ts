import { describe, expect, it } from "vitest";
import { isCanvasMutationRequest } from "@/app/workspace/utils/workspaceDifyAgentResponse";

describe("isCanvasMutationRequest", () => {
  it.each([
    "Add one text block with the text X.",
    "Change the text of DIRECT_1 to Y",
    "Make the block bold",
    "Delete the block T1_AI",
    "Thêm một khối văn bản",
    "Rename the second block",
  ])("treats %s as a change request", (text) => expect(isCanvasMutationRequest(text)).toBe(true));

  it.each([
    "Summarize in two sentences what is on the board. Make no changes.",
    "Which blocks mention PROJECT? Make no changes.",
    "What is the project code in the uploaded file?",
    "Where is the address of the office noted?",
    "Reply with PING and do not change the board",
    "Tóm tắt bảng, không thay đổi gì",
  ])("does not treat %s as a change request", (text) => expect(isCanvasMutationRequest(text)).toBe(false));
});
