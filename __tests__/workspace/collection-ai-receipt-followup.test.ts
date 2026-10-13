import { describe, expect, it, vi } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { applyCollectionAction } from "@/app/api/workspaces/[id]/agent/collectionOperations";
import { resolveCollectionTargets } from "@/lib/workspace-agent/collectionTargetResolution";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import { parseDifyAgentAnswer } from "@/app/workspace/utils/workspaceDifyAgentResponse";
import { consumeWorkspaceChatResponse } from "@/app/workspace/utils/workspaceChatStream";
import { safeWorkspaceAssistantContent } from "@/app/workspace/utils/workspaceChatVisibleContent";
import type { WorkspaceJson, WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

function setup(query: string) {
  const data = createCollection();
  const state = { blocks: { "collection-1": { id: "collection-1", type: "collection", data } },
    blockOrder: ["collection-1"], connectors: {}, title: "Board" };
  const input: WorkspaceRuntimeRequest = {
    boardId: "board-1", turnId: "receipt-smoke", query, modelSelector: "model",
    authorization: "Bearer test-service", workspaceUserToken: "test-token",
    canMutate: true, signal: new AbortController().signal,
  };
  return { state, data, input };
}

async function visibleRuntimeAnswer(answer: string, appliedSummaries: string[]) {
  const payload = JSON.stringify({ answer, appliedSummaries, unresolvedSummaries: [], focusBlockIds: [] });
  const event = { event: "workflow_finished", data: { outputs: { answer: payload } } };
  const stream = new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  const parsed = parseDifyAgentAnswer((await consumeWorkspaceChatResponse(stream, () => {})).answer);
  return { parsed, visible: safeWorkspaceAssistantContent(parsed.content) };
}

describe("Collection AI issue #5 confirmed receipt follow-up", () => {
  it("deleting by unique name shows the persisted record label through SSE and UI", async () => {
    const { data, state, input } = setup("Delete PR6 smoke keep from the collection");
    const stableId = "a89acec1-0bc9-4b20-bbd2-39147b963853";
    data.records.push({ id: stableId, values: {
      [data.fields[0].id]: "PR6 smoke keep", [data.fields[1].id]: "Done",
    } });
    const execute = vi.fn(async (_input: WorkspaceRuntimeRequest, _turnId: string, _round: number,
      _revision: number, actions: WorkspaceJson[]) => {
      const resolved = resolveCollectionTargets(actions[0], { blocks: state.blocks } as unknown as WorkspaceJson);
      expect(resolved.error).toBeUndefined();
      expect(resolved.action.recordId).toBe(stableId);
      const change = applyCollectionAction(state as never, resolved.action);
      expect(change?.ids).toEqual(["collection-1"]);
      return { httpStatus: 200, body: { success: true, revision: 2, actions: [{
        type: "delete_collection_record", ids: ["collection-1"], changed: true, summary: change?.summary,
        targets: { blockId: "collection-1", recordId: stableId },
      }], result: { changedBlocks: [{ id: "collection-1", summary: "Generic collection title" }] } } };
    });
    const turn = await runWorkspaceAgentTurn(input, {
      readSnapshot: async () => ({ revision: 1, ...state }) as never,
      modelProvider: { propose: async () => ({ answer: JSON.stringify({ done: true, message: "Deleted", actions: [{
        type: "delete_collection_record", blockId: "collection-1", recordName: "PR6 smoke keep",
      }] }), conversationId: null }) },
      execute,
    });
    expect(turn.status).toBe("completed");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(data.records).toHaveLength(0);
    expect(turn.receipts).toMatchObject([{ persisted: true, actionType: "delete_collection_record", revisionAfter: 2 }]);
    expect(turn.receipts[0].summary).toContain('deleted Collection record "PR6 smoke keep"');
    expect(turn.answer).not.toContain("delete_collection_record ()");
    const rendered = await visibleRuntimeAnswer(turn.answer, turn.appliedSummaries);
    expect(rendered.visible).toContain('deleted Collection record "PR6 smoke keep"');
    expect(rendered.parsed.appliedSummaries).toContain(turn.receipts[0].summary);
    expect(rendered.visible).not.toContain("()"); // no ID-only receipt lost to UUID sanitizer
  });

  it.each([true, false])("one successful create action remains completed, done=%s", async (done) => {
    const { data, state, input } = setup("Create one Collection record");
    const stableId = "create-record-1";
    let revision = 1;
    const action = { type: "create_collection_record", blockId: "collection-1",
      recordId: stableId, values: { Name: "Single success", Status: "Done" } };
    const execute = vi.fn(async (_input: WorkspaceRuntimeRequest, _turnId: string, _round: number,
      _baseRevision: number, actions: WorkspaceJson[]) => {
      const resolved = resolveCollectionTargets(actions[0], { blocks: state.blocks } as unknown as WorkspaceJson);
      expect(resolved.error).toBeUndefined();
      const result = applyCollectionAction(state as never, resolved.action);
      expect(result?.ids).toEqual(["collection-1"]);
      revision++;
      return { httpStatus: 200, body: { success: true, revision, actions: [{
        type: "create_collection_record", ids: ["collection-1"], changed: true, summary: result?.summary,
      }] } };
    });
    const modelProvider = { propose: vi.fn()
      .mockResolvedValueOnce({ answer: JSON.stringify({ done, message: "Created", actions: [action] }), conversationId: null })
      .mockResolvedValueOnce({ answer: JSON.stringify({ done: true, message: "Created", actions: [action] }), conversationId: null }) };
    const turn = await runWorkspaceAgentTurn(input, {
      readSnapshot: async () => ({ revision, ...state }) as never,
      modelProvider, execute,
    });
    expect(turn.status).toBe("completed");
    expect(turn.unresolvedSummaries).toEqual([]);
    expect(turn.receipts).toMatchObject([{ actionType: "create_collection_record", persisted: true }]);
    expect(turn.receipts).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(data.records).toHaveLength(1);
    expect(data.records[0].id).toBe(stableId);
    expect(turn.answer).toContain("create_collection_record");
    expect(turn.answer).not.toMatch(/Some changes were saved, but|Một phần thay đổi|could not confirm/i);
    const rendered = await visibleRuntimeAnswer(turn.answer, turn.appliedSummaries);
    expect(rendered.visible).toContain("create_collection_record");
    expect(rendered.visible).not.toMatch(/attempted, but applied nothing|Một phần thay đổi/i);
    expect(modelProvider.propose).toHaveBeenCalledTimes(done ? 1 : 2);
  });
});
