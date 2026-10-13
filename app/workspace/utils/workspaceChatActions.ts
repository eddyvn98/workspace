import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform } from "../types/block";
import { applyWorkspaceLegacyChatAction } from "./workspaceChatLegacyActions";
import { asRecord, normalizeStyle } from "./workspaceChatResolver";
import { WORKSPACE_HISTORY_ACTION_ID } from "./workspaceChatHistoryActions";
import { createActionMapBlocks } from "./workspaceChatMapLayout";
import { isStructuredCreateMapType, mapLayoutPatchForCreate, normalizeCreateMapOptions } from "./workspaceChatMapOptions";
import { applyWorkspaceMapLayoutPatch } from "../layout/applyMapLayoutPatch";
import { applyWorkspaceChatDiagramAction } from "./workspaceChatDiagramActions";
import { reflowWorkspaceTrees } from "../layout/reflowWorkspaceTree";
import { TEXT_SIZE, type ActionMapLayoutOptions, type ActionNode } from "./workspaceChatActionTypes";
import { WORKSPACE_COMMAND_NAME_SET } from "../../../lib/workspace-command-registry";
export type WorkspaceActionSpec =
  | { kind: "create_map"; type: "create_map"; nodes: ActionNode[]; options: ActionMapLayoutOptions; raw: Record<string, unknown> }
  | { kind: "diagram"; type: "create_flowchart" | "extend_flowchart" | "create_swimlane" | "repair_connector" | "repair_flowchart"; raw: Record<string, unknown> }
  | { kind: "legacy"; type: string; raw: Record<string, unknown> };
export interface ParsedPayload {
  message: string;
  actions: WorkspaceActionSpec[];
  /** True only when the complete action envelope was valid JSON. */
  validEnvelope?: boolean;
  /** True when action objects were recovered from a malformed provider reply. */
  recoveredFromMalformed?: boolean;
}
export interface WorkspaceChatActionResult {
  displayContent: string;
  appliedBlockIds: string[];
  appliedActionCount: number;
}
const SUPPORTED_DIAGRAM_ACTIONS = new Set(["create_flowchart", "extend_flowchart", "create_swimlane", "repair_connector", "repair_flowchart"]);
const SUPPORTED_LEGACY_ACTIONS = new Set(
  [...WORKSPACE_COMMAND_NAME_SET].filter((name) => name !== "create_map" && !SUPPORTED_DIAGRAM_ACTIONS.has(name)),
);
function balancedObject(raw: string, startAt: number): string | null {
  const start = raw.indexOf("{", startAt);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

/** Some providers occasionally truncate the array wrapper while streaming,
 *  leaving valid action objects behind, e.g. `"actions": },{"type":...`.
 *  Recover only objects with a supported `type`; never infer missing targets
 *  or fields, so malformed/ambiguous edits remain a safe no-op. */
function parseLooseActionSequence(raw: string): ParsedPayload | null {
  const actions: WorkspaceActionSpec[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf("{", cursor);
    if (start < 0) break;
    const candidate = balancedObject(raw, start);
    // A truncated outer envelope can still contain complete action objects.
    // Keep scanning after the unmatched opening brace so one broken wrapper
    // does not hide safe, self-contained actions that follow it.
    if (!candidate) {
      cursor = start + 1;
      continue;
    }
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
      if (type === "create_map") {
        const nodes = normalizeLegacyCreateMapNodes(value).map(normalizeNode).filter((node): node is ActionNode => Boolean(node));
        const options = normalizeCreateMapOptions(value);
        if (nodes.length > 0 && isStructuredCreateMapType(value.layoutType ?? asRecord(value.params).layoutType)) {
          actions.push({ kind: "create_map", type: "create_map", nodes, options, raw: value });
        }
      } else if (SUPPORTED_DIAGRAM_ACTIONS.has(type)) {
        actions.push({ kind: "diagram", type: type as "create_flowchart" | "extend_flowchart" | "create_swimlane" | "repair_connector" | "repair_flowchart", raw: value });
      } else if (SUPPORTED_LEGACY_ACTIONS.has(type)) {
        actions.push({ kind: "legacy", type, raw: value });
      }
    } catch {
      // A nested object or incomplete object is ignored; the next object may
      // still be a complete action in a provider's truncated response.
    }
    cursor = start + candidate.length;
  }
  if (actions.length === 0) return null;
  let message = "";
  const messageMatch = raw.match(/\"message\"\s*:\s*(\"(?:\\.|[^\"\\])*\")/);
  if (messageMatch) {
    try { message = String(JSON.parse(messageMatch[1])).trim(); } catch { /* keep empty */ }
  }
  return { message, actions, validEnvelope: false, recoveredFromMalformed: true };
}
function normalizeTable(raw: unknown): ActionNode["table"] {
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) return undefined;
  const rows = Math.max(1, Math.min(20, Number(value.rows) || 3));
  const cols = Math.max(1, Math.min(20, Number(value.cols ?? value.columns) || 3));
  const source = Array.isArray(value.cells) ? value.cells : [];
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => String((source[row] as unknown[] | undefined)?.[col] ?? "")),
  );
  return { rows, cols, cells };
}
function normalizeNode(raw: unknown): ActionNode | null {
  if (typeof raw === "string") {
    const topic = raw.trim();
    return topic ? { topic, children: [] } : null;
  }
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) return null;
  const topic = String(value.topic ?? value.name ?? value.text ?? value.label ?? "").trim();
  if (!topic) return null;
  const children = Array.isArray(value.children) ? value.children.map(normalizeNode).filter((node): node is ActionNode => Boolean(node)) : [];
  const style = normalizeStyle(value.style);
  const table = normalizeTable(value.table);
  const image = typeof value.image === "string" && value.image.trim() ? value.image : undefined;
  return {
    topic,
    children,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.icon === "string" ? { icon: value.icon } : {}),
    ...(image ? { image } : {}),
    ...(style ? { style } : {}),
    ...(table ? { table } : {}),
  };
}
function normalizeLegacyCreateMapNodes(action: Record<string, unknown>): unknown[] {
  const params = asRecord(action.params);
  const directNodes = Array.isArray(action.nodes) ? action.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  if (directNodes.length > 0) return directNodes;
  const legacySingleNode = action.node ?? action.to ?? params.node ?? params.to;
  if (legacySingleNode !== undefined) return [legacySingleNode];
  if (
    typeof action.topic === "string" ||
    typeof action.name === "string" ||
    typeof action.text === "string" ||
    typeof action.label === "string"
  ) {
    return [action];
  }
  if (
    typeof params.topic === "string" ||
    typeof params.name === "string" ||
    typeof params.text === "string" ||
    typeof params.label === "string"
  ) {
    return [params];
  }
  return [];
}
function parsePayload(raw: string): ParsedPayload {
  // DeepSeek/Dify can prepend a <think>...</think> block containing examples
  // of the JSON contract. Never let those examples become the action object.
  const withoutReasoning = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const parse = (candidate: string): ParsedPayload | null => {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      if (!Array.isArray(value.actions)) return null;
      const actions: WorkspaceActionSpec[] = [];
      for (const entry of value.actions) {
        if (!entry || typeof entry !== "object") continue;
        const action = entry as Record<string, unknown>;
        const type = typeof action.type === "string" ? action.type.toLowerCase() : "";
        if (type === "create_map") {
          const rawNodes = normalizeLegacyCreateMapNodes(action);
          const nodes = rawNodes.map(normalizeNode).filter((node): node is ActionNode => Boolean(node));
          const options = normalizeCreateMapOptions(action);
          if (nodes.length > 0 && isStructuredCreateMapType(action.layoutType ?? asRecord(action.params).layoutType)) {
            actions.push({ kind: "create_map", type: "create_map", nodes, options, raw: action });
          }
        } else if (SUPPORTED_DIAGRAM_ACTIONS.has(type)) {
          actions.push({ kind: "diagram", type: type as "create_flowchart" | "extend_flowchart" | "create_swimlane" | "repair_connector" | "repair_flowchart", raw: action });
        } else if (SUPPORTED_LEGACY_ACTIONS.has(type)) {
          actions.push({ kind: "legacy", type, raw: action });
        }
      }
      return { message: typeof value.message === "string" ? value.message.trim() : "", actions, validEnvelope: true };
    } catch {
      return null;
    }
  };
  const direct = parse(withoutReasoning);
  if (direct) return direct;
  const fenceStart = withoutReasoning.search(/```[\w-]*\s*/i);
  if (fenceStart >= 0) {
    const fenced = balancedObject(withoutReasoning, fenceStart);
    if (fenced) {
      const res = parse(fenced);
      if (res) return res;
    }
  }
  const embedded = balancedObject(withoutReasoning, 0);
  if (embedded) {
    const res = parse(embedded);
    if (res) return res;
  }
  const loose = parseLooseActionSequence(withoutReasoning);
  if (loose) return loose;
  return { message: withoutReasoning, actions: [], validEnvelope: false };
}

export function inspectWorkspaceChatActionAnswer(answer: string): ParsedPayload {
  return parsePayload(answer);
}
/**
 * What to show in the chat bubble once any action blocks are stripped out.
 *
 * `appliedActionCount` decides the last-resort fallback, and that matters:
 * this used to always fall back to "Applied the requested map to the
 * canvas." — including on the zero-action path — so a plain conversational
 * answer that happened to carry no prose was reported to the user as an
 * applied canvas edit that never happened.
 */
function cleanDisplayContent(raw: string, message: string, appliedActionCount: number, attemptedActions = false): string {
  const cleaned = raw.replace(/```[\w-]*\s*[\s\S]*?```/gi, "").trim();
  if (attemptedActions && appliedActionCount === 0) {
    return "The requested canvas action could not be applied. No changes were made.";
  }
  if (message || cleaned) return message || cleaned;
  return appliedActionCount > 0
    ? "Applied the requested map to the canvas."
    : "No changes were made to the canvas.";
}
export function applyWorkspaceChatActions(
  answer: string,
  options?: { skipDiagrams?: boolean },
): WorkspaceChatActionResult {
  const payload = parsePayload(answer);
  if (payload.actions.length === 0) {
    return { displayContent: cleanDisplayContent(answer, payload.message, 0), appliedBlockIds: [], appliedActionCount: 0 };
  }
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) {
    return { displayContent: payload.message || "This board is read-only.", appliedBlockIds: [], appliedActionCount: 0 };
  }
  const appliedBlockIds: string[] = [];
  let appliedActionCount = 0;
  let connectorActionApplied = false;
  for (const action of payload.actions) {
    if (action.kind === "create_map") {
      // Re-read the store for every create_map. `state` is the snapshot that
      // existed when this turn started; addBlock() replaces the blocks map on
      // every write, so reusing state.blocks here makes multiple maps emitted
      // by one AI turn all calculate the same origin and stack together.
      const existing = Object.values(useWorkspaceStore.getState().blocks);
      const maxX = existing.reduce((max, block) => {
        const transform = resolveTransform(block.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 });
        return Math.max(max, transform.x + transform.w);
      }, 0);
      const minY = existing.reduce((min, block) => {
        const transform = resolveTransform(block.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 });
        return Math.min(min, transform.y);
      }, 0);
      const zIndex = existing.reduce((max, block) => Math.max(max, resolveTransform(block.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 }).zIndex), 0) + 1;
      const rootY = existing.length > 0 ? minY : 0;

      const result = createActionMapBlocks(action.nodes, existing.length > 0 ? maxX + 120 : 0, rootY, zIndex);
      result.blocks.forEach((block) => {
        state.addBlock(block);
        appliedBlockIds.push(block.id);
      });
      result.connectors.forEach((connector) => state.addConnector(connector));
      result.rootIds.forEach((rootId) => {
        applyWorkspaceMapLayoutPatch(rootId, mapLayoutPatchForCreate(action.options));
      });
      appliedActionCount += 1;
    } else if (action.kind === "diagram") {
      if (options?.skipDiagrams) continue;
      const affectedIds = applyWorkspaceChatDiagramAction(action.raw);
      if (affectedIds.length > 0) {
        appliedBlockIds.push(...affectedIds);
        appliedActionCount += 1;
        if (action.type === "repair_connector" || action.type === "repair_flowchart") connectorActionApplied = true;
      }
    } else if (action.kind === "legacy") {
      const affectedIds = applyWorkspaceLegacyChatAction(action.raw);
      if (affectedIds.length > 0) {
        appliedBlockIds.push(...affectedIds.filter((id) => id !== WORKSPACE_HISTORY_ACTION_ID));
        appliedActionCount += 1;
        if (action.type === "connect_nodes" || action.type === "update_relationship") connectorActionApplied = true;
      }
    }
  }
  // Legacy chat actions can update a block-level description directly,
  // without going through BlockDescription's editor. Re-run the shared tree
  // layout once after the batch so those descriptions get the same reserved
  // footprint and cannot overlap a sibling node.
  if (appliedActionCount > 0) reflowWorkspaceTrees();
  const survivingSelectedIds = appliedBlockIds.filter((id) => Boolean(useWorkspaceStore.getState().blocks[id]));
  if (!connectorActionApplied && survivingSelectedIds.length > 0) {
    state.setSelection(survivingSelectedIds);
  }
  return {
    displayContent: cleanDisplayContent(answer, payload.message, appliedActionCount, payload.actions.length > 0),
    appliedBlockIds,
    appliedActionCount,
  };
}
