import React from "react";
import type { CanvasConnector } from "../types/connector";

export function activateQuickAddButtonAtPoint(clientX: number, clientY: number): boolean {
  // This helper runs from the connector hit path, which is below the block
  // overlay. A button's box can overlap that path even when the browser's
  // actual hit target is the path (transparent quick-add affordances still
  // have a layout rect). Only delegate when the browser resolved this point
  // to the button itself; otherwise a connector click must remain a connector
  // click instead of silently creating a node.
  const target = document.elementFromPoint(clientX, clientY);
  const button = target?.closest<HTMLButtonElement>('button[aria-label^="Add block "]');
  if (!button || !button.isConnected) return false;
  button.click();
  return true;
}

export function endpointDecoration(
  style: "none" | "arrow" | "dot" | "slash",
  point: { x: number; y: number },
  travelAngle: number,
  isStart: boolean,
  color: string,
  opacity: number,
) {
  if (style === "none") return null;
  if (style === "dot") return <circle cx={point.x} cy={point.y} r={4.5} fill={color} opacity={opacity} />;
  if (style === "slash") {
    const dx = Math.cos(travelAngle + Math.PI / 2) * 5;
    const dy = Math.sin(travelAngle + Math.PI / 2) * 5;
    return <line x1={point.x - dx} y1={point.y - dy} x2={point.x + dx} y2={point.y + dy} stroke={color} strokeWidth={2} opacity={opacity} />;
  }
  const angle = isStart ? travelAngle + Math.PI : travelAngle;
  const tip = point;
  const base = { x: tip.x - Math.cos(angle) * 9, y: tip.y - Math.sin(angle) * 9 };
  const wing = { x: Math.cos(angle + Math.PI / 2) * 4.5, y: Math.sin(angle + Math.PI / 2) * 4.5 };
  return <path d={`M ${tip.x} ${tip.y} L ${base.x + wing.x} ${base.y + wing.y} L ${base.x - wing.x} ${base.y - wing.y} Z`} fill={color} opacity={opacity} />;
}

/** Renders a connector's midpoint text label — color/size/bold/italic/
 *  underline/strikethrough/background/alignment/orientation, matching
 *  legacy Mindmap's `ConnectorLabelEditor`/`SvgRelationshipItem` label
 *  fields: a white (or custom) background pill with a faint border,
 *  centered directly on the line — not the plain text-outline look. */
export function renderConnectorLabel(
  connector: CanvasConnector,
  midpoint: { x: number; y: number },
  lineAngleRad: number,
  color: string,
  opacity: number,
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void,
  selected = false,
  onPointerMove?: (e: React.PointerEvent<SVGGElement>) => void,
  onPointerUp?: (e: React.PointerEvent<SVGGElement>) => void,
  onPointerCancel?: (e: React.PointerEvent<SVGGElement>) => void,
) {
  if (!connector.label) return null;
  const labelFontSize = connector.labelFontSize ?? 11;
  const align = connector.labelAlign ?? "center";
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  // "follow" rotates the label to the connector's overall angle (endpoint-to-
  // endpoint, not the exact curve tangent — a reasonable approximation for
  // curved/orthogonal lines too). Unset/"horizontal" keeps it upright.
  const orientation = connector.labelOrientation === "perpendicular"
    ? "perpendicular"
    : connector.labelOrientation === "parallel" || connector.labelOrientation === "follow"
      ? "parallel"
      : "horizontal";
  let labelAngleRad = orientation === "perpendicular" ? lineAngleRad + Math.PI / 2 : orientation === "parallel" ? lineAngleRad : 0;
  if (labelAngleRad > Math.PI / 2) labelAngleRad -= Math.PI;
  if (labelAngleRad < -Math.PI / 2) labelAngleRad += Math.PI;
  const labelAngle = (labelAngleRad * 180) / Math.PI;
  const boxWidth = connector.label.length * labelFontSize * 0.6 + 10;
  const boxHeight = labelFontSize + 8;
  const textX = align === "left" ? -boxWidth / 2 + 5 : align === "right" ? boxWidth / 2 - 5 : 0;
  const labelColor = connector.labelColor ?? color;
  const labelBgColor = connector.labelBgColor ?? "#ffffff";

  return (
    <g
      data-connector-label-group={connector.id}
      transform={`translate(${midpoint.x}, ${midpoint.y}) rotate(${labelAngle})`}
      style={{ pointerEvents: "auto", cursor: selected ? "grab" : "pointer", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <rect
        x={-boxWidth / 2}
        y={-boxHeight / 2}
        width={boxWidth}
        height={boxHeight}
        rx={4}
        data-connector-label={connector.id}
        // Selection changes the outline only. Preserve the user's label
        // background color exactly; bend markers have their own top visual
        // layer and no longer require a translucent label fill.
        fill={labelBgColor}
        stroke={selected ? "#2563eb" : labelColor}
        strokeWidth={selected ? 1.5 : 0.5}
        strokeOpacity={selected ? 0.9 : 0.2}
        opacity={selected ? 1 : opacity}
      />
      <text
        x={textX}
        y={0}
        dominantBaseline="central"
        textAnchor={textAnchor}
        fontSize={labelFontSize}
        fontWeight={connector.labelBold ? 700 : 500}
        fontStyle={connector.labelItalic ? "italic" : "normal"}
        fill={labelColor}
        opacity={selected ? 1 : opacity}
        style={{
          userSelect: "none",
          textDecoration: [
            connector.labelUnderline && "underline",
            connector.labelStrikethrough && "line-through",
          ].filter(Boolean).join(" ") || undefined,
        }}
      >
        {connector.label}
      </text>
    </g>
  );
}
