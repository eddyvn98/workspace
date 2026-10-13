import { describe, expect, it } from "vitest";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

describe("Dify model proposal envelope", () => {
  const proposal = { done: false, message: "Proposed", actions: [{ type: "rename_topic", blockId: "block-1", title: "Runtime Beta" }] };
  it("accepts the closed leading reasoning envelope observed on staging", () => {
    expect(parseWorkspaceModelProposal(`<think>Reasoning about the plan</think>${JSON.stringify(proposal)}`)).toEqual(proposal);
  });
  it("accepts multiple closed leading reasoning blocks", () => {
    expect(parseWorkspaceModelProposal(` <THINK>First</THINK>\n<think>Second</think>\n${JSON.stringify(proposal)}`)).toEqual(proposal);
  });
  it("preserves literal reasoning tags inside requested values", () => {
    const literal = { done: true, message: "Proposed", actions: [{ type: "update_description", blockId: "b", description: "Keep <think>literal text</think> intact" }] };
    expect(parseWorkspaceModelProposal(JSON.stringify(literal))).toEqual(literal);
  });
  it.each(["undo", "redo"] as const)("accepts standalone %s without a block id", (type) => {
    const historyAction = { done: false, message: "History action", actions: [{ type }] };
    expect(parseWorkspaceModelProposal(JSON.stringify(historyAction))).toEqual(historyAction);
  });
  it("rejects history actions mixed with other mutations", () => {
    const mixed = { done: false, message: "Mixed", actions: [{ type: "undo" }, { type: "rename_board", title: "Unsafe" }] };
    expect(() => parseWorkspaceModelProposal(JSON.stringify(mixed))).toThrow("Undo and redo must be the only action");
  });
  it.each([`<think>Unclosed ${JSON.stringify(proposal)}`, `Here is the result: ${JSON.stringify(proposal)}`, `${JSON.stringify(proposal)} extra text`])("rejects incomplete or ambiguous envelopes before execution", (answer) => {
    expect(() => parseWorkspaceModelProposal(answer)).toThrow("valid JSON");
  });
});
