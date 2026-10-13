import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasConnector } from "../types/connector";
import { asNumber, asRecord, firstString, resolveWorkspaceTargetIds } from "./workspaceChatResolver";

function resolveEndpoint(raw: Record<string, unknown>, key: "from" | "to") {
  const params = asRecord(raw.params);
  const value = raw[key] ?? params[key];
  if (value === undefined) return undefined;
  const ids = resolveWorkspaceTargetIds({ target: value });
  return ids.length === 1 ? ids[0] : undefined;
}

function boolArrow(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() !== "none";
  return fallback;
}

function patchConnector(connector: CanvasConnector, patch: Record<string, unknown>): CanvasConnector {
  const next = { ...connector };
  const type = firstString(patch.type);
  if (type) {
    next.lineType = type === "orthogonal" ? "orthogonal" : type === "curved" ? "curved" : "straight";
    if (type === "straight_arrow") next.arrowEnd = true;
  }
  const dash = firstString(patch.lineDash);
  if (dash) next.dashed = dash !== "solid";
  const color = firstString(patch.lineColor);
  if (color) next.strokeColor = color;
  const width = asNumber(patch.lineWidth);
  if (width !== undefined) next.strokeWidth = Math.max(1, width);
  if (patch.arrowStart !== undefined) next.arrowStart = boolArrow(patch.arrowStart, Boolean(next.arrowStart));
  if (patch.arrowEnd !== undefined) next.arrowEnd = boolArrow(patch.arrowEnd, Boolean(next.arrowEnd));
  const label = firstString(patch.lineLabel);
  if (label !== undefined) next.label = label;
  const labelColor = firstString(patch.labelColor);
  if (labelColor !== undefined) next.labelColor = labelColor;
  const labelFontSize = asNumber(patch.labelFontSize);
  if (labelFontSize !== undefined) next.labelFontSize = Math.min(72, Math.max(8, labelFontSize));
  for (const key of ["labelBold", "labelItalic", "labelUnderline", "labelStrikethrough"] as const) {
    if (typeof patch[key] === "boolean") next[key] = patch[key] as boolean;
  }
  const labelBgColor = firstString(patch.labelBgColor);
  if (labelBgColor !== undefined) next.labelBgColor = labelBgColor;
  if (patch.labelAlign === "left" || patch.labelAlign === "center" || patch.labelAlign === "right") next.labelAlign = patch.labelAlign;
  const labelPosition = asNumber(patch.labelPosition);
  if (labelPosition !== undefined) next.labelPosition = Math.min(1, Math.max(0, labelPosition));
  if (patch.labelOrientation === "horizontal" || patch.labelOrientation === "parallel" || patch.labelOrientation === "perpendicular" || patch.labelOrientation === "follow") next.labelOrientation = patch.labelOrientation;
  if (Array.isArray(patch.waypoints)) next.waypoints = patch.waypoints.map(asRecord).filter((point) => asNumber(point.x) !== undefined && asNumber(point.y) !== undefined).map((point) => ({ x: asNumber(point.x)!, y: asNumber(point.y)! }));
  const trunkAxis = asNumber(patch.trunkAxis);
  if (trunkAxis !== undefined) next.trunkAxis = trunkAxis;
  return next;
}

export function applyWorkspaceUpdateRelationship(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return [];
  const params = asRecord(raw.params);
  const fromBlockId = resolveEndpoint(raw, "from");
  const toBlockId = resolveEndpoint(raw, "to");
  if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) return [];
  const patch = asRecord(raw.relationshipPatch ?? params.relationshipPatch);
  const ids = Object.values(state.connectors)
    .filter((connector) => connector.fromBlockId === fromBlockId && connector.toBlockId === toBlockId)
    .map((connector) => connector.id);
  if (ids.length === 0 || Object.keys(patch).length === 0) return [];

  const connectors = { ...state.connectors };
  ids.forEach((id) => {
    const connector = connectors[id];
    if (connector) connectors[id] = patchConnector(connector, patch);
  });
  useWorkspaceStore.setState({ connectors, selectedConnectorId: ids[0] });
  return ids;
}
