"use client";

import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { asNumber, asRecord, firstString, resolveWorkspaceTargetIds } from "./workspaceChatResolver";

function resolveEndpoint(raw: Record<string, unknown>, key: "from" | "to"): string | undefined {
  const params = asRecord(raw.params);
  const value = raw[key] ?? params[key];
  if (value === undefined) return undefined;
  const ids = resolveWorkspaceTargetIds({ target: value });
  return ids.length === 1 ? ids[0] : undefined;
}

function arrowEnabled(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() !== "none";
  return fallback;
}

export function applyWorkspaceConnectNodes(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return [];

  const params = asRecord(raw.params);
  const fromBlockId = resolveEndpoint(raw, "from");
  const toBlockId = resolveEndpoint(raw, "to");
  if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) return [];

  const connectionStyle = firstString(raw.connectionStyle, params.connectionStyle)?.toLowerCase();
  const lineType = "orthogonal";
  const connector: CanvasConnector = {
    id: createConnectorId(),
    fromBlockId,
    toBlockId,
    // No fromSide/toSide here: leaving both undefined lets
    // computeConnectorGeometry run its own obstacle-aware side search (the
    // same one a manually-dragged connector gets) instead of a fixed
    // right-to-left line that ignores where the two blocks actually sit —
    // found live via an AI-built floor-plan diagram where every connector
    // rendered right-to-left regardless of relative position, producing
    // crossing lines a correct side choice would have avoided.
    lineType,
    arrowStart: arrowEnabled(raw.arrowStart ?? params.arrowStart, false),
    arrowEnd: arrowEnabled(raw.arrowEnd ?? params.arrowEnd, connectionStyle === "straight_arrow"),
  };

  const label = firstString(raw.lineLabel, params.lineLabel, raw.label, params.label);
  const color = firstString(raw.lineColor, params.lineColor);
  const width = asNumber(raw.lineWidth ?? params.lineWidth);
  const dash = firstString(raw.lineDash, params.lineDash)?.toLowerCase();
  if (label) connector.label = label;
  if (color) connector.strokeColor = color;
  if (width !== undefined) connector.strokeWidth = width;
  if (dash) connector.dashed = dash !== "solid";

  state.addConnector(connector);
  state.setSelectedConnectorId(connector.id);
  state.setSelection([]);
  return [fromBlockId, toBlockId];
}
