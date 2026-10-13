import { handleCanvasRead } from "./canvasRead";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commandReceiptKey } from "@/lib/workspace/commandReceipts";
import { commitAgentMutation, replayCommand } from "./commitMutation";
import { resolveWorkspaceCallerAuth } from "../../_auth";
import { resolveAccessRole } from "../../_access";
import { asBlockRecord, collectBlockEditEvents, collectConnectorEditEvents } from "../../_edit-events";
import { applyAgentAction, ensureMapClearOfOtherBlocks, type AgentBoardState } from "./operations";
import { layoutExistingMap } from "./mapLayout";
import { mapRoot } from "./operationsCore";
import { prepareHistory } from "./history";
import { applyServerMapPalette, normalizeAgentMapLayoutAction } from "./mapStyleParity";
import { findUnconfirmedDuplicateTargetFanout } from "./paritySelectionOperations";
import { isWorkspaceCommandName } from "@/lib/workspace-command-registry";
import { bulkDeleteGuard } from "./bulkDeleteGuard";
import { handleCommentActions } from "./commentAction";
import { handleBoardActions } from "./boardAction";
import { enrichFileActions, handleFileReadActions } from "./fileAction";
import {
  boardContent,
  createBlock,
  findBlock,
  id,
  list,
  map,
  normalizeAgentActionBatch,
  normalizeAgentBody,
  parseAgentBody,
  type JsonMap,
} from "./routeHelpers";

type Action = "read" | "find" | "create" | "update" | "delete" | "connect" | "disconnect" | "verify";

/** POST /api/workspaces/[id]/agent — apply an AI-planned board operation.
 *
 *  Accepts either a browser session (NextAuth cookie) or the Dify Workspace
 *  Agent (service key + X-Workspace-User-Token, which may also arrive as a
 *  `workspace_user_token` body field — see lib/workspace/agentAuth.ts). The
 *  body is read before auth so that fallback field can be checked; both
 *  paths resolve to an email and run through the same resolveAccessRole
 *  check below as any other write to this board. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rawBody = await req.text();
  const body = normalizeAgentBody(parseAgentBody(rawBody));
  const runtimeTurnId = body?.runtimeTurnId;
  if (runtimeTurnId !== undefined && (typeof runtimeTurnId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(runtimeTurnId))) {
    return NextResponse.json({ error: "Invalid runtime turn id" }, { status: 400 });
  }

  const auth = await resolveWorkspaceCallerAuth(req, body ?? undefined);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message, code: auth.code }, { status: auth.status });
  }
  const email = auth.email;

  const action = body?.action as Action | undefined;
  const allowed: Action[] = ["read", "find", "create", "update", "delete", "connect", "disconnect", "verify"];
  let plannedActions = (Array.isArray(body?.actions)
    ? normalizeAgentActionBatch(body)
    : action && !allowed.includes(action)
      ? [{ ...body, type: action }]
      : []).map(normalizeAgentMapLayoutAction);
  if (plannedActions.length === 0 && (!action || !allowed.includes(action))) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const unsupportedCommand = plannedActions.find((item) => !isWorkspaceCommandName(item.type));
  if (unsupportedCommand) {
    return NextResponse.json({
      error: "Unsupported Workspace command",
      reason: "command_not_registered",
      command: String(unsupportedCommand.type ?? ""),
    }, { status: 400 });
  }

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let receiptKey;
  try { receiptKey = commandReceiptKey(params.id, email, body ?? {}); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const replay = await replayCommand(receiptKey);
  if (replay) return replay;

  const commentResponse = await handleCommentActions(board, email, plannedActions, role, receiptKey);
  if (commentResponse) return commentResponse;
  const boardResponse = await handleBoardActions(board, email, plannedActions, role);
  if (boardResponse) return boardResponse;
  const fileReadResponse = await handleFileReadActions(board, email, plannedActions);
  if (fileReadResponse) return fileReadResponse;

  // Operations mutate entities in place, so diffs and history need detached before-images.
  const boardBlocksBefore = structuredClone(board.blocks);
  const boardConnectorsBefore = structuredClone(board.connectors);

  const blocks = list(board.blocks);
  const connectors = list(board.connectors);
  const readResponse = handleCanvasRead(action, body ?? {}, board, blocks);
  if (readResponse) return readResponse;
  if (role === "VIEWER") return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  if (!Number.isInteger(body?.baseRevision) || body?.baseRevision !== board.revision) {
    return NextResponse.json({ error: "baseRevision must match the current board revision", reason: "stale", revision: board.revision }, { status: 409 });
  }
  const fileActions = await enrichFileActions(board, email, plannedActions);
  if (fileActions instanceof NextResponse) return fileActions;
  plannedActions = fileActions;

  const nextBlocks = Object.fromEntries(blocks.map((block) => [String(block.id), block]));
  const nextOrder: string[] = Array.isArray(board.blockOrder) ? board.blockOrder.map((value) => String(value)) : blocks.map((block) => String(block.id));
  const nextConnectors = Object.fromEntries(connectors.map((connector) => [String(connector.id), connector]));
  let editOperation = String(body.editOperation ?? action);
  let state: AgentBoardState = { ...boardContent(board), blocks: nextBlocks, blockOrder: nextOrder, connectors: nextConnectors, title: board.title };
  const previousState = structuredClone(state);
  const appliedActions: Array<{ type: string; ids: string[]; changed: boolean; reason?: string; notes?: string[] }> = [];
  const historyType = plannedActions.length === 1 && (plannedActions[0].type === "undo" || plannedActions[0].type === "redo") ? plannedActions[0].type as "undo" | "redo" : undefined;

  if (!historyType) {
    const ambiguousFanout = findUnconfirmedDuplicateTargetFanout(plannedActions, state);
    if (ambiguousFanout) {
      return NextResponse.json({
        error: "Multiple blocks share this label. Ask the user which one, or explicitly confirm all matching blocks before applying the change.",
        reason: "ambiguous_target",
        targetLabel: ambiguousFanout.label,
        candidateCount: ambiguousFanout.ids.length,
        revision: board.revision,
      }, { status: 409 });
    }
  }

  const preparedHistory = historyType ? await prepareHistory(params.id, historyType, boardContent(board)) : null;
  if (historyType) {
    const target = preparedHistory?.snapshot;
    if (!target) return NextResponse.json({ error: `No ${historyType} history is available for this board`, reason: "history_empty", revision: board.revision }, { status: 422 });
    state = { ...state, ...target, blocks: map(target.blocks) as Record<string, JsonMap>, blockOrder: Array.isArray(target.blockOrder) ? target.blockOrder.map((value) => String(value)) : [], connectors: map(target.connectors) as Record<string, JsonMap> };
    appliedActions.push({ type: historyType, ids: [historyType], changed: true });
  } else if (plannedActions.length > 0) {
    // AI-generated input, arbitrarily shaped — an unexpected shape reaching a
    // defensive-but-not-bulletproof spot inside operations.ts's switch must
    // fail this action with the route's normal structured 422, not an opaque
    // unhandled 500 that breaks the agent's error-recovery contract with Dify.
    try {
      const mapsToKeepClear = new Set<string>();
      const mapsWithManualPositions = new Set<string>();
      const mapsToReflow = new Map<string, JsonMap>();
      for (const planned of plannedActions) {
        const actionBefore = structuredClone({
          blocks: state.blocks,
          blockOrder: state.blockOrder,
          connectors: state.connectors,
          title: state.title,
        });
        const result = applyAgentAction(state, planned);
        if (planned.type === "update_map_style" && result.geometryChanged && result.ids[0]) {
          mapsToKeepClear.add(result.ids[0]);
          mapsToReflow.set(result.ids[0], planned);
        } else if (planned.type === "update_transform") {
          result.ids.forEach((blockId) => {
            const rootId = mapRoot(state, blockId);
            const family = String(map(state.blocks[rootId]?.mapLayout).family ?? "");
            if (family && !["flowchart", "swimlane"].includes(family)) {
              mapsToKeepClear.add(rootId);
              mapsWithManualPositions.add(rootId);
            }
          });
        }
        const paletteApplied = planned.type === "update_map_style"
          ? applyServerMapPalette(state, planned, result.ids[0])
          : false;
        // A non-empty ID result means the operation resolved its target and
        // applied its mutation. The complete board diff is calculated once
        // below, instead of cloning/stringifying the board for every action.
        const changed = paletteApplied || result.ids.length > 0;
        appliedActions.push({ type: String(planned.type ?? ""), ids: result.ids, changed, ...(result.reason ? { reason: result.reason } : {}), ...(result.summary ? { summary: result.summary.slice(0, 240) } : {}), ...(result.notes?.length ? { notes: result.notes } : {}) });
        if (result.operation) editOperation = `ai.${result.operation}`;
      }
      // A model may follow a structured layout choice with arbitrary
      // per-block coordinates. The explicit layout intent wins over those
      // coordinates; recompute the tree once the whole action batch is known.
      mapsToReflow.forEach((layoutAction, rootId) => {
        const source = map(layoutAction.style);
        const params = map(layoutAction.params);
        const layoutInput: JsonMap = { ...map(state.blocks[rootId]?.mapLayout), ...layoutAction };
        if (layoutAction.growthMode === undefined && params.growthMode === undefined && source.growthMode === undefined) {
          delete layoutInput.growthMode;
        }
        layoutExistingMap(state, rootId, layoutInput);
      });
      // A single AI turn can follow layout with per-block transforms. Recheck
      // after the full batch so those later actions cannot reintroduce overlap.
      mapsToKeepClear.forEach((rootId) => ensureMapClearOfOtherBlocks(state, rootId, {
        preserveManualPositions: mapsWithManualPositions.has(rootId) && !mapsToReflow.has(rootId),
      }));
    } catch (err) {
      console.warn("[workspace agent] action failed:", err);
      return NextResponse.json({ error: "One or more Workspace actions could not be applied", reason: "action_not_applied", revision: board.revision, actions: appliedActions }, { status: 422 });
    }
    const unapplied = appliedActions.filter((item) => item.ids.length === 0).map((item) => item.type);
    if (unapplied.length > 0) {
      const reasons = appliedActions.filter((item) => item.ids.length === 0 && (item.reason || item.notes?.length)).map((item) => `${item.type}: ${[item.reason, ...(item.notes ?? [])].filter(Boolean).join(" ")}`);
      const error = `Workspace action(s) could not be applied: ${unapplied.join(", ")}. ${reasons.length ? `Reason: ${reasons.join(" | ")} ` : "No target matched or a parameter was missing. "}Read the board again, use exact block ids (connectorId for connectors), then retry once.`;
      return NextResponse.json({ error, reason: "action_not_applied", failedActions: unapplied, revision: board.revision, actions: appliedActions }, { status: 422 });
    }
  }

  const bulkDelete = historyType ? null : bulkDeleteGuard(plannedActions, boardBlocksBefore, state.blocks, board.revision); if (bulkDelete) return bulkDelete;
  if (plannedActions.length === 0 && action === "create") {
    const block = createBlock(map(body.block));
    nextBlocks[String(block.id)] = block;
    nextOrder.push(String(block.id));
  } else if (plannedActions.length === 0 && action === "update") {
    const block = findBlock(blocks, body.blockId);
    if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 });
    const patch = map(body.patch);
    const dataPatch = map(patch.data);
    nextBlocks[String(block.id)] = {
      ...block, ...patch, data: { ...map(block.data), ...dataPatch }, updatedAt: Date.now(), id: block.id,
    };
  } else if (plannedActions.length === 0 && action === "delete") {
    if (!findBlock(blocks, body.blockId)) return NextResponse.json({ error: "Block not found" }, { status: 404 });
    delete nextBlocks[String(body.blockId)];
    const index = nextOrder.indexOf(String(body.blockId));
    if (index >= 0) nextOrder.splice(index, 1);
    for (const connector of connectors) {
      if (connector.fromBlockId === body.blockId || connector.toBlockId === body.blockId) delete nextConnectors[String(connector.id)];
    }
  } else if (plannedActions.length === 0 && action === "connect") {
    if (!findBlock(blocks, body.fromBlockId) || !findBlock(blocks, body.toBlockId) || body.fromBlockId === body.toBlockId) {
      return NextResponse.json({ error: "Both endpoint blocks must exist and be different" }, { status: 400 });
    }
    const connector = { id: id(), fromBlockId: body.fromBlockId, toBlockId: body.toBlockId, lineType: body.lineType === "curved" || body.lineType === "orthogonal" ? body.lineType : "straight", ...(typeof body.label === "string" ? { label: body.label } : {}), ...(typeof body.arrowEnd === "boolean" ? { arrowEnd: body.arrowEnd } : {}) };
    nextConnectors[connector.id] = connector;
  } else if (plannedActions.length === 0 && action === "disconnect") {
    const connectorId = typeof body.connectorId === "string" ? body.connectorId : undefined;
    const removed = connectorId
      ? Boolean(nextConnectors[connectorId])
      : Object.entries(nextConnectors).filter(([, connector]) => connector.fromBlockId === body.fromBlockId && connector.toBlockId === body.toBlockId).map(([key]) => key).length > 0;
    if (connectorId) delete nextConnectors[connectorId];
    else Object.entries(nextConnectors).forEach(([key, connector]) => { if (connector.fromBlockId === body.fromBlockId && connector.toBlockId === body.toBlockId) delete nextConnectors[key]; });
    if (!removed) return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const content = boardContent(board);
  content.title = state.title;
  content.blocks = state.blocks;
  content.blockOrder = state.blockOrder;
  content.connectors = state.connectors;
  content.frames = state.frames ?? [];
  for (const key of Object.keys(state).filter((key) => key.startsWith("tree"))) (content as JsonMap)[key] = state[key];
  if (state.camera !== undefined) content.camera = state.camera as never;
  // Diff against state.blocks/state.connectors, not the outer nextBlocks/
  // nextConnectors consts — the undo/redo branch above reassigns state to a
  // brand-new object (decoupled from nextBlocks/nextConnectors) when
  // restoring a history snapshot, so diffing against the stale consts would
  // always compare the pre-undo content to itself and report zero changes.
  const editEvents = [
    ...collectBlockEditEvents(params.id, asBlockRecord(boardBlocksBefore), asBlockRecord(state.blocks), email, editOperation),
    ...collectConnectorEditEvents(params.id, asBlockRecord(boardConnectorsBefore), asBlockRecord(state.connectors), email),
  ];
  return commitAgentMutation({
    board, email, state, previousState, content, editEvents, appliedActions,
    plannedActionCount: plannedActions.length, action, receiptKey,
    ...(typeof runtimeTurnId === "string" ? { runtimeTurnId } : {}),
    completeHistory: preparedHistory?.complete,
  });
}
