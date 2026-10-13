import { describe, expect, it } from "vitest";
import { computeAssistantTurnResult } from "@/app/workspace/hooks/workspaceChatTurnResult";

const board = { id: "b", revision: 5, title: "t", blocks: {}, blockOrder: [], connectors: {} } as never;
const base = {
  boardBefore: board,
  boardAfter: board,
  localBlocksBefore: {},
  localBlocksAfter: {},
  localConnectorsBefore: {},
  localConnectorsAfter: {},
  parsedDifyAnswer: { content: "Added a comment on GATE.", appliedSummaries: ["Added comment on GATE"] },
  userRequest: "Add a comment saying check this on the block GATE.",
  actionResult: null,
  invalidActionResponse: false,
};

describe("chat turn result for comment-only turns", () => {
  it("is a success when a comment was actually added", () => {
    const turn = computeAssistantTurnResult({ ...base, commentsAdded: 1 });
    expect(turn.claimedMutationWithoutPersistence).toBe(false);
    expect(turn.content).toBe("Added a comment on GATE.");
    expect(turn.appliedSummaries).toEqual(["Added comment on GATE"]);
  });

  it("is still flagged when the AI claims a change and nothing persisted", () => {
    expect(computeAssistantTurnResult({ ...base, commentsAdded: 0 }).claimedMutationWithoutPersistence).toBe(true);
  });
});
