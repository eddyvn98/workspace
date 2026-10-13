import { NextResponse } from "next/server";
import type { Prisma, WorkspaceBoard } from "@prisma/client";
import { boardMetadata } from "@/lib/workspace/boardMetadata";
import { commitBoardContent, type BoardCommitOutcome } from "@/lib/workspace/boardCommit";
import { readCommandReceipt, writeCommandReceipt, type CommandReceiptKey } from "@/lib/workspace/commandReceipts";
import { diffRecordMap } from "@/lib/workspace/ws-repository-notify";
import { drainWorkspaceRealtimeOutbox, enqueueWorkspaceRealtimePatch } from "@/lib/workspace/realtimeOutbox";
import { asBlockRecord } from "../../_edit-events";
import { rememberChange } from "./history";
import type { AgentBoardState } from "./operations";
import { agentMutationReceipt, list, type JsonMap } from "./routeHelpers";
import { receiptNotes } from "./receiptNotes";
import { lockActiveWorkspaceTurn, WorkspaceTurnNotActiveError } from "@/lib/workspace-agent/turnStore";

type AppliedAction = { type: string; ids: string[]; changed: boolean; reason?: string; notes?: string[] };

export async function replayCommand(key: CommandReceiptKey | null): Promise<NextResponse | null> {
  if (!key) return null;
  const saved = await readCommandReceipt(key);
  if (saved.kind === "missing") return null;
  if (saved.kind === "conflict") return NextResponse.json({ error: "requestId was already used for a different command", reason: "request_id_conflict" }, { status: 409 });
  return NextResponse.json(saved.response, { headers: { "X-Workspace-Receipt-Replayed": "true" } });
}

export async function commitAgentMutation(input: {
  board: WorkspaceBoard;
  email: string;
  state: AgentBoardState;
  previousState: AgentBoardState;
  content: JsonMap;
  editEvents: Prisma.WorkspaceBoardEditEventCreateManyInput[];
  appliedActions: AppliedAction[];
  plannedActionCount: number;
  action?: string;
  receiptKey: CommandReceiptKey | null;
  runtimeTurnId?: string;
  completeHistory?: (tx: Prisma.TransactionClient) => Promise<void>;
}) {
  const { board, email, state, previousState, appliedActions, receiptKey } = input;
  const blockDiff = diffRecordMap(asBlockRecord(previousState.blocks), asBlockRecord(state.blocks));
  const connectorDiff = diffRecordMap(asBlockRecord(previousState.connectors), asBlockRecord(state.connectors));
  const beforeOrder = previousState.blockOrder;
  const metadata = Object.fromEntries(Object.entries(boardMetadata(state))
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previousState[key])));
  const boardChanged = Object.keys(blockDiff.upsert).length > 0 || blockDiff.removeIds.length > 0
    || Object.keys(connectorDiff.upsert).length > 0 || connectorDiff.removeIds.length > 0
    || JSON.stringify(beforeOrder) !== JSON.stringify(state.blockOrder) || Object.keys(metadata).length > 0
    || state.title !== previousState.title
    || JSON.stringify(state.camera) !== JSON.stringify(previousState.camera);
  const success = input.plannedActionCount > 0 ? appliedActions.some(item => item.changed) && boardChanged : boardChanged;
  const responseFor = (committed: WorkspaceBoard) => ({
    success, ok: true, action: input.action ?? "batch", actions: appliedActions,
    result: agentMutationReceipt(committed, appliedActions, previousState.frames),
    notes: receiptNotes(appliedActions, state.blocks), revision: committed.revision,
    blockCount: list(committed.blocks).length, connectorCount: list(committed.connectors).length,
    ...(receiptKey ? { requestId: receiptKey.requestId, revisionBefore: board.revision, persisted: true } : {}),
  });
  if (input.completeHistory && !boardChanged) {
    const error = "The recorded change no longer applies to the current board; history was left unchanged.";
    return NextResponse.json({
      success: false,
      ok: false,
      action: input.action ?? "batch",
      actions: appliedActions.map((item) => ({ ...item, changed: false, reason: error })),
      error,
      reason: "history_conflict",
      revision: board.revision,
    }, { status: 409 });
  }
  let outcome: BoardCommitOutcome;
  try {
    outcome = await commitBoardContent({
      boardId: board.id, actorEmail: email, content: input.content as never, editEvents: input.editEvents,
      baseRevision: board.revision, existing: board,
      ...(input.runtimeTurnId ? {
        beforeBoardCommit: async (tx: Prisma.TransactionClient) => {
          const active = await lockActiveWorkspaceTurn(tx, { boardId: board.id, actorEmail: email, turnId: input.runtimeTurnId! });
          if (!active) throw new WorkspaceTurnNotActiveError();
        },
      } : {}),
      ...(receiptKey ? { writeCommandReceipt: (tx: Prisma.TransactionClient, committed: WorkspaceBoard) => writeCommandReceipt(tx, receiptKey, responseFor(committed)) } : {}),
      writeAgentHistory: async (tx) => {
        if (input.completeHistory) await input.completeHistory(tx);
        else await rememberChange(tx, board.id, previousState, state);
      },
      ...(boardChanged ? {
        writeRealtimeOutbox: (tx: Prisma.TransactionClient, committed: WorkspaceBoard) => enqueueWorkspaceRealtimePatch(tx, {
          boardId: board.id,
          revision: committed.revision,
          patch: {
            upsertBlocks: blockDiff.upsert, removeBlockIds: blockDiff.removeIds,
            upsertConnectors: connectorDiff.upsert, removeConnectorIds: connectorDiff.removeIds,
            blockOrder: state.blockOrder, previousBlockOrder: beforeOrder,
            metadata, previousMetadata: boardMetadata(previousState),
          },
        }),
      } : {}),
    });
  } catch (error) {
    if (error instanceof WorkspaceTurnNotActiveError) {
      return NextResponse.json({ error: error.message, reason: "turn_not_active", revision: board.revision }, { status: 409 });
    }
    throw error;
  }
  if ("gone" in outcome) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ("stale" in outcome) {
    const replay = await replayCommand(receiptKey);
    return replay ?? NextResponse.json({ error: "Board changed while applying the action", reason: "stale", revision: outcome.revision }, { status: 409 });
  }
  await drainWorkspaceRealtimeOutbox(20, board.id);
  return NextResponse.json(responseFor(outcome.board));
}
