"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, GripVertical, RotateCcw, Spline, Tag, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasConnector } from "../types/connector";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";
import { ConnectorStylePopoverBody } from "./ConnectorStylePopoverBody";
import { ConnectorLabelPopoverBody } from "./ConnectorLabelPopoverBody";
import { blockScreenRect, workspaceCanvasOrigin } from "../utils/blockRects";
import type { ConnectorStylePatch } from "../connectors/connectorStyle";
import { useAnchoredPanelPosition } from "../hooks/useAnchoredPanelPosition";
import { currentMapLayout } from "../layout/mapRoot";
import { isWorkspaceStructuralConnector } from "../hooks/useWorkspaceConnectorSelectionPolicy";

type ConnectorPopoverKey = "style" | "label" | null;

/** Compact top bar + one rich popover, mirroring the legacy relationship-line
 *  toolbar (drag handle, a single "line type" dropdown button opening a
 *  CONNECTOR popover with Type/Pattern/Weight/Opacity/Color/Arrow-heads, Label,
 *  Delete) with legacy orange active states and compact hierarchy. */
export function ConnectorStylePanel() {
  const [activePopover, setActivePopover] = useState<ConnectorPopoverKey>(null);
  const selectedConnectorId = useWorkspaceStore((state) => state.selectedConnectorId);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const treeLayoutFamily = useWorkspaceStore((state) => state.treeLayoutFamily);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const removeConnector = useWorkspaceStore((state) => state.removeConnector);
  const setSelectedConnectorId = useWorkspaceStore((state) => state.setSelectedConnectorId);
  const currentConnector = selectedConnectorId ? connectors[selectedConnectorId] : null;
  const connectorMapFamily = currentConnector
    ? currentMapLayout({
      blocks,
      treeLayoutFamily,
      treeLayoutDirection: useWorkspaceStore.getState().treeLayoutDirection,
      treeGrowthMode: useWorkspaceStore.getState().treeGrowthMode,
      treeConnectorLineType: useWorkspaceStore.getState().treeConnectorLineType,
      treeConnectorPaletteId: useWorkspaceStore.getState().treeConnectorPaletteId,
      treeTimelineBranchMode: useWorkspaceStore.getState().treeTimelineBranchMode,
      treeTimelineDescendantStyle: useWorkspaceStore.getState().treeTimelineDescendantStyle,
      treeCatalogDescendantStyle: useWorkspaceStore.getState().treeCatalogDescendantStyle,
    }, currentConnector.fromBlockId).family
    : null;

  // Switching to a different connector (or deselecting) must close whichever
  // popover was open for the previous one — otherwise it keeps showing the
  // stale connector's style/label panel anchored to the new selection.
  useEffect(() => {
    setActivePopover(null);
  }, [selectedConnectorId]);

  const { toolbarRef, style: anchoredStyle, placement, handleToolbarDragStart } = useAnchoredPanelPosition(
    Boolean(currentConnector),
    () => {
      if (!currentConnector) return null;
      if (typeof document !== "undefined") {
        const path = Array.from(document.querySelectorAll<SVGPathElement>("path[data-connector-id]"))
          .find((candidate) => candidate.dataset.connectorId === selectedConnectorId
            && typeof candidate.getTotalLength === "function"
            && typeof candidate.getPointAtLength === "function");
        const matrix = path?.getScreenCTM?.();
        if (path && matrix) {
          const length = path.getTotalLength();
          const point = path.getPointAtLength(length / 2);
          // Anchor to the rendered wire, not to the straight line between
          // node centres. Orthogonal detours and long cross-map connectors
          // otherwise put the toolbar on top of a different part of the wire.
          return new DOMRect(
            point.x * matrix.a + point.y * matrix.c + matrix.e,
            point.x * matrix.b + point.y * matrix.d + matrix.f,
            0,
            0,
          );
        }
      }
      const { blocks, camera } = useWorkspaceStore.getState();
      const origin = workspaceCanvasOrigin();
      const fromRect = blockScreenRect(blocks, currentConnector.fromBlockId, camera, origin);
      const toRect = blockScreenRect(blocks, currentConnector.toBlockId, camera, origin);
      if (!fromRect || !toRect) return null;
      const midX = (fromRect.left + fromRect.width / 2 + toRect.left + toRect.width / 2) / 2;
      const midY = (fromRect.top + fromRect.height / 2 + toRect.top + toRect.height / 2) / 2;
      return new DOMRect(midX, midY, 0, 0);
    },
    {
      resetKey: selectedConnectorId,
      onDragStart: () => setActivePopover(null),
      getAvoidRects: () => {
        if (typeof document === "undefined") return [];
        return Array.from(document.querySelectorAll<SVGPathElement>("path[data-connector-id]"))
          .filter((path) => path.dataset.connectorId === selectedConnectorId)
          .flatMap((path) => {
            const padding = 8;
            const length = typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
            const matrix = typeof path.getScreenCTM === "function" ? path.getScreenCTM() : null;
            if (length > 0 && matrix) {
              const segments: DOMRect[] = [];
              const steps = Math.max(1, Math.ceil(length / 24));
              let previous = path.getPointAtLength(0);
              for (let index = 1; index <= steps; index += 1) {
                const current = path.getPointAtLength((length * index) / steps);
                const transform = (point: DOMPoint) => ({
                  x: point.x * matrix.a + point.y * matrix.c + matrix.e,
                  y: point.x * matrix.b + point.y * matrix.d + matrix.f,
                });
                const start = transform(previous);
                const end = transform(current);
                const left = Math.min(start.x, end.x) - padding;
                const top = Math.min(start.y, end.y) - padding;
                segments.push(new DOMRect(left, top, Math.abs(end.x - start.x) + padding * 2, Math.abs(end.y - start.y) + padding * 2));
                previous = current;
              }
              return segments;
            }
            const rect = path.getBoundingClientRect();
            return [new DOMRect(rect.left - padding, rect.top - padding, rect.width + padding * 2, rect.height + padding * 2)];
          });
      },
    },
  );

  if (
    !selectedConnectorId
    || !currentConnector
    || (connectorMapFamily !== "hierarchy" && connectorMapFamily !== "flowchart" && connectorMapFamily !== "swimlane")
    || (connectorMapFamily !== "flowchart" && connectorMapFamily !== "swimlane" && isWorkspaceStructuralConnector(currentConnector, blocks))
  ) {
    return null;
  }

  const togglePopover = (key: ConnectorPopoverKey) =>
    setActivePopover((prev) => (prev === key ? null : key));

  const updateConnector = (patch: ConnectorStylePatch) => {
    useWorkspaceStore.setState((state) => {
      if (state.isReadOnly) return state;
      const existing = state.connectors[selectedConnectorId];
      if (!existing) return state;
      return {
        connectors: {
          ...state.connectors,
          [selectedConnectorId]: { ...existing, ...patch } as CanvasConnector,
        },
      };
    });
  };

  const btnInactive =
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100";
  const btnActive = "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400";
  const labelOrientation = currentConnector.labelOrientation === "perpendicular"
    ? "perpendicular"
    : currentConnector.labelOrientation === "parallel" || currentConnector.labelOrientation === "follow"
      ? "parallel"
      : "horizontal";

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Connector Toolbar"
      className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none [&_*]:pointer-events-auto"
      style={anchoredStyle ?? { top: 80, right: 16 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        onPointerDown={handleToolbarDragStart}
        className="-ml-1 flex h-7 w-4 cursor-grab touch-none items-center justify-center text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
        title="Drag to reposition toolbar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Connector style popover: type/pattern/weight/color/arrow-heads */}
      <div className="relative">
        <button
          type="button"
          title="Connector Style"
          aria-label="Connector Style"
          aria-expanded={activePopover === "style"}
          aria-haspopup="dialog"
          disabled={isReadOnly}
          onClick={() => togglePopover("style")}
          className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-medium transition cursor-pointer ${
            activePopover === "style" ? btnActive : btnInactive
          }`}
        >
          <Spline className="h-3.5 w-3.5" />
          <span
            className="h-2.5 w-2.5 rounded-full border border-black/15 dark:border-white/20 shrink-0"
            style={{ backgroundColor: currentConnector.strokeColor ?? "#64748b" }}
          />
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        <SwatchPopover
          isOpen={activePopover === "style"}
          onClose={() => setActivePopover(null)}
          title="Connector"
          placeBelow={placement === "below"}
        >
          <ConnectorStylePopoverBody connector={currentConnector} onUpdate={updateConnector} />
        </SwatchPopover>
      </div>

      <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

      {/* Label popover */}
      <div className="relative">
        <button
          type="button"
          title="Label"
          aria-label="Label"
          aria-expanded={activePopover === "label"}
          aria-haspopup="dialog"
          disabled={isReadOnly}
          onClick={() => togglePopover("label")}
          className={`flex h-7 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-medium transition cursor-pointer ${
            activePopover === "label" || Boolean(currentConnector.label) ? btnActive : btnInactive
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          {currentConnector.label && (
            <span className="max-w-[80px] truncate text-[11px] font-medium">{currentConnector.label}</span>
          )}
        </button>
        <SwatchPopover
          isOpen={activePopover === "label"}
          onClose={() => setActivePopover(null)}
          title="Label"
          showTitle={false}
          placeBelow={placement === "below"}
          allowOverflow
        >
          <ConnectorLabelPopoverBody
            connector={currentConnector}
            isReadOnly={isReadOnly}
            updateConnector={updateConnector}
          />
        </SwatchPopover>
      </div>

      <div
        className="flex items-center gap-0.5 rounded-lg border border-slate-200 px-0.5 dark:border-slate-700"
        aria-label="Label orientation"
      >
        {[
          ["horizontal", "H", "Horizontal"],
          ["parallel", "∥", "Parallel to wire"],
          ["perpendicular", "⊥", "Perpendicular to wire"],
        ].map(([value, glyph, title]) => (
          <button
            key={value}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={labelOrientation === value}
            disabled={isReadOnly}
            onClick={() => useWorkspaceStore.setState((state) => {
              if (state.isReadOnly) return state;
              const existing = state.connectors[selectedConnectorId];
              if (!existing) return state;
              return {
                connectors: {
                  ...state.connectors,
                  [selectedConnectorId]: { ...existing, labelOrientation: value as "horizontal" | "parallel" | "perpendicular" },
                },
              };
            })}
            className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-bold leading-none transition cursor-pointer ${
              labelOrientation === value ? btnActive : btnInactive
            }`}
          >
            {glyph}
          </button>
        ))}
      </div>

      {currentConnector.waypoints && currentConnector.waypoints.length > 0 && (
        <>
          <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            title={`Reset bends (${currentConnector.waypoints.length})`}
            aria-label={`Reset bends (${currentConnector.waypoints.length})`}
            disabled={isReadOnly}
            onClick={() => updateConnector({ waypoints: undefined })}
            className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-[10px] font-medium transition cursor-pointer ${btnInactive}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{currentConnector.waypoints.length}</span>
          </button>
        </>
      )}

      {!isReadOnly && (
        <>
          <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            title="Delete connector"
            aria-label="Delete connector"
            onClick={() => {
              removeConnector(selectedConnectorId);
              setSelectedConnectorId(null);
            }}
            className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export default ConnectorStylePanel;
