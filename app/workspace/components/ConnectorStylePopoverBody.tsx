"use client";

import React from "react";
import { Check } from "lucide-react";
import type { CanvasConnector } from "../types/connector";
import {
  type ConnectorArrowStyle,
  type ConnectorLinePattern,
  type ConnectorStylePatch,
  getConnectorVisualStyle,
  stylePatchForArrow,
  stylePatchForPattern,
} from "../connectors/connectorStyle";
import { WORKSPACE_SOLID_COLORS as SOLID_COLORS, getArrowStyleIcon, getLineDashIcon, getLineTypeIcon } from "./WorkspaceConnectorIcons";

const TYPES = ["curved", "orthogonal", "straight"] as const;
const PATTERNS: ConnectorLinePattern[] = ["solid", "dashed", "dotted"];
const WIDTHS = [1, 1.5, 2, 3, 4, 6] as const;
const ARROWS: ConnectorArrowStyle[] = ["none", "arrow", "dot", "slash"];

export function ConnectorStylePopoverBody({
  connector,
  onUpdate,
  allowLineType = true,
}: {
  connector: CanvasConnector;
  onUpdate: (patch: ConnectorStylePatch) => void;
  allowLineType?: boolean;
}) {
  const style = getConnectorVisualStyle(connector);
  const update = (patch: ConnectorStylePatch) => onUpdate(patch);
  const currentColor = (style.color ?? "#64748b").toLowerCase();

  return (
    <div className="w-[318px] select-none" data-testid="connector-style-popover-body">
      <div className={allowLineType ? "grid grid-cols-2 gap-3" : ""}>
        {allowLineType && <div>
          <div className="mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Type</div>
          <div className="grid grid-cols-3 gap-1">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                title={type}
                aria-label={type}
                aria-pressed={style.lineType === type}
                onClick={() => update({ lineType: type })}
                className={`flex h-7 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  style.lineType === type
                    ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                }`}
              >
                {getLineTypeIcon(type, "w-7 h-3")}
              </button>
            ))}
          </div>
        </div>}
        <div>
          <div className="mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Pattern</div>
          <div className="grid grid-cols-3 gap-1">
            {PATTERNS.map((dash) => (
              <button
                key={dash}
                type="button"
                title={dash}
                aria-label={dash}
                aria-pressed={style.linePattern === dash}
                onClick={() => update(stylePatchForPattern(dash))}
                className={`flex h-7 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  style.linePattern === dash
                    ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                }`}
              >
                {getLineDashIcon(dash, "w-8 h-1.5")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Line jumps"
        aria-pressed={style.lineJump}
        onClick={() => update({ lineJump: !style.lineJump })}
        className={`mt-2 flex h-7 w-full items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
          style.lineJump
            ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
            : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
        }`}
      >
        Line jumps
      </button>

      <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span>Weight</span>
            <span className="font-mono text-orange-600 dark:text-orange-400">{style.lineWidth}px</span>
          </div>
          <div className="flex gap-1">
            {WIDTHS.map((width) => (
              <button
                key={width}
                type="button"
                title={`${width}px`}
                aria-label={`Weight ${width}px`}
                aria-pressed={style.lineWidth === width}
                onClick={() => update({ strokeWidth: width })}
                className={`flex h-6 flex-1 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  style.lineWidth === width
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                }`}
              >
                <span
                  className="rounded-full bg-slate-700 dark:bg-slate-300"
                  style={{ width: `${width * 2.5}px`, height: `${width * 2.5}px` }}
                />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span>Opacity</span>
            <span className="font-mono text-orange-600 dark:text-orange-400">{style.lineOpacity}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            aria-label="Opacity"
            value={style.lineOpacity}
            onChange={(e) => update({ lineOpacity: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-orange-500 dark:bg-slate-800"
          />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr] gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
        <div>
          <div className="mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Color</div>
          <div className="grid grid-cols-4 gap-1.5">
            {SOLID_COLORS.map((color) => {
              const isSelected = currentColor === color.value.toLowerCase();
              return (
                <button
                  key={color.value}
                  type="button"
                  title={color.name}
                  aria-label={`Line color ${color.name}`}
                  aria-pressed={isSelected}
                  onClick={() => update({ strokeColor: color.value })}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 transition-transform hover:scale-110 active:scale-90 dark:border-slate-800 cursor-pointer"
                  style={{ backgroundColor: color.value }}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Arrow heads</div>
          <div className="grid grid-cols-4 gap-1">
            {ARROWS.map((styleItem) => (
              <button
                key={`start-${styleItem}`}
                type="button"
                title={`Start ${styleItem}`}
                aria-label={`Start ${styleItem}`}
                aria-pressed={style.arrowStart === styleItem}
                onClick={() => update(stylePatchForArrow("start", styleItem))}
                className={`flex h-7 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  style.arrowStart === styleItem
                    ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                }`}
              >
                {getArrowStyleIcon(styleItem, "start", "w-7 h-3")}
              </button>
            ))}
            {ARROWS.map((styleItem) => (
              <button
                key={`end-${styleItem}`}
                type="button"
                title={`End ${styleItem}`}
                aria-label={`End ${styleItem}`}
                aria-pressed={style.arrowEnd === styleItem}
                onClick={() => update(stylePatchForArrow("end", styleItem))}
                className={`flex h-7 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  style.arrowEnd === styleItem
                    ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                }`}
              >
                {getArrowStyleIcon(styleItem, "end", "w-7 h-3")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConnectorStylePopoverBody;
