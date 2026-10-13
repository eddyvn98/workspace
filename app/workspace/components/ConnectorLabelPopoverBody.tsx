"use client";

import React, { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Italic, Strikethrough, Underline } from "lucide-react";
import type { CanvasConnector } from "../types/connector";
import type { ConnectorStylePatch } from "../connectors/connectorStyle";
import { WorkspaceTextColorPopover } from "./WorkspaceTextControlsPopovers";

type LabelPopoverKey = "color" | "bgColor" | "align" | null;
type ToggleKey = "labelBold" | "labelItalic" | "labelUnderline" | "labelStrikethrough";

const LABEL_BG_COLORS = ["", "#fef3c7", "#dbeafe", "#dcfce7", "#fee2e2", "#f3e8ff"];
const TOGGLES: { key: ToggleKey; Icon: typeof Bold; title: string }[] = [
  { key: "labelBold", Icon: Bold, title: "Bold" },
  { key: "labelItalic", Icon: Italic, title: "Italic" },
  { key: "labelUnderline", Icon: Underline, title: "Underline" },
  { key: "labelStrikethrough", Icon: Strikethrough, title: "Strikethrough" },
];
const ALIGNS: { value: NonNullable<CanvasConnector["labelAlign"]>; Icon: typeof AlignLeft }[] = [
  { value: "left", Icon: AlignLeft },
  { value: "center", Icon: AlignCenter },
  { value: "right", Icon: AlignRight },
];

/** Label popover content for ConnectorStylePanel — text, color, size, bold/
 *  italic/underline/strikethrough, background color, alignment, and
 *  follow-line orientation. Laid out as two stacked groups (text input, then
 *  a formatting toolbar of dropdown triggers) to match legacy Mindmap's
 *  floating `ConnectorLabelEditor`. Extracted out of ConnectorStylePanel.tsx
 *  purely to keep that file under the project's 300-line cap. */
export function ConnectorLabelPopoverBody({
  connector,
  isReadOnly,
  updateConnector,
}: {
  connector: CanvasConnector;
  isReadOnly: boolean;
  updateConnector: (patch: ConnectorStylePatch) => void;
}) {
  const [labelPopover, setLabelPopover] = useState<LabelPopoverKey>(null);
  const currentAlign = connector.labelAlign ?? "center";
  const CurrentAlignIcon = ALIGNS.find((a) => a.value === currentAlign)?.Icon ?? AlignCenter;

  return (
    <div className="flex w-56 flex-col gap-1.5">
      <div className="flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
        <input
          type="text"
          autoFocus
          disabled={isReadOnly}
          placeholder="Label text…"
          value={connector.label ?? ""}
          onChange={(e) => updateConnector({ label: e.target.value || undefined })}
          className="w-full bg-transparent text-xs text-slate-800 outline-none dark:text-slate-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 px-1.5 py-1 dark:border-slate-700">
        <input
          type="number"
          min={8}
          max={36}
          disabled={isReadOnly}
          title="Font size"
          value={connector.labelFontSize ?? 11}
          onChange={(e) => updateConnector({ labelFontSize: Number(e.target.value) })}
          className="w-8 rounded border border-slate-200 px-1 py-0.5 text-center text-[10px] outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

        {TOGGLES.map(({ key, Icon, title }) => (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={Boolean(connector[key])}
            disabled={isReadOnly}
            onClick={() => updateConnector({ [key]: !connector[key] })}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition cursor-pointer ${
              connector[key]
                ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}

        <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

        <div className="relative">
          <button
            type="button"
            title="Text alignment"
            aria-label="Text alignment"
            disabled={isReadOnly}
            onClick={() => setLabelPopover(labelPopover === "align" ? null : "align")}
            className="flex h-6 items-center gap-0.5 rounded-md px-1 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <CurrentAlignIcon className="h-3 w-3" />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {labelPopover === "align" && (
            <div className="absolute left-0 top-7 z-50 flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {ALIGNS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  title={`Align ${value}`}
                  aria-label={`Align ${value}`}
                  aria-pressed={currentAlign === value}
                  onClick={() => { updateConnector({ labelAlign: value }); setLabelPopover(null); }}
                  className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${
                    currentAlign === value
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            title="Label color"
            aria-label="Label color"
            disabled={isReadOnly}
            onClick={() => setLabelPopover(labelPopover === "color" ? null : "color")}
            className="flex h-6 items-center gap-1 rounded-md px-1 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <span className="text-[11px] font-bold leading-none" style={{ color: connector.labelColor || "#475569" }}>A</span>
            <span
              className="h-2 w-2 shrink-0 rounded-sm border border-slate-300 dark:border-slate-600"
              style={{ backgroundColor: connector.labelColor || "#475569" }}
            />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {labelPopover === "color" && (
            <WorkspaceTextColorPopover
              textColor={connector.labelColor}
              onPick={(patch) => updateConnector({ labelColor: patch.textColor })}
              onClose={() => setLabelPopover(null)}
            />
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            title="Label background"
            aria-label="Label background"
            disabled={isReadOnly}
            onClick={() => setLabelPopover(labelPopover === "bgColor" ? null : "bgColor")}
            className="flex h-6 items-center gap-1 rounded-md px-1 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <span className="text-[9px] font-semibold leading-none text-slate-400">bg</span>
            <span
              className={`h-3 w-4 shrink-0 rounded ${connector.labelBgColor ? "border border-slate-300 dark:border-slate-600" : "border border-dashed border-slate-300 dark:border-slate-600"}`}
              style={{ backgroundColor: connector.labelBgColor || "transparent" }}
            />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {labelPopover === "bgColor" && (
            <div className="absolute right-0 bottom-7 z-50 flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {LABEL_BG_COLORS.map((bg) => (
                <button
                  key={bg || "none"}
                  type="button"
                  title={bg || "No background"}
                  onClick={() => { updateConnector({ labelBgColor: bg || undefined }); setLabelPopover(null); }}
                  className={`h-5 w-5 rounded border border-slate-300 dark:border-slate-600 ${!bg ? "border-dashed" : ""}`}
                  style={{ backgroundColor: bg || "transparent" }}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default ConnectorLabelPopoverBody;
