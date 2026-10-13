"use client";

import React from "react";
import { X } from "lucide-react";
import type { BlockStyle, ShapeKind } from "../types/block";
import { renderShapeIcon } from "./WorkspaceToolbarPrimitives";
import { WorkspaceSmartPopover as SmartPopover } from "../utils/WorkspaceSmartPopover";

const BG_COLORS = [
  { name: "None", value: "none" }, { name: "White", value: "#ffffff" }, { name: "Slate Light", value: "#e2e8f0" },
  { name: "Purple Light", value: "#f3e8ff" }, { name: "Blue Light", value: "#dbeafe" }, { name: "Green Light", value: "#dcfce7" },
  { name: "Yellow Light", value: "#fef9c3" }, { name: "Orange Light", value: "#ffedd5" }, { name: "Red Light", value: "#fee2e2" },
];
const SOLID_COLORS = [
  { name: "Black", value: "#000000" }, { name: "Gray", value: "#64748b" }, { name: "Purple", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" }, { name: "Green", value: "#16a34a" }, { name: "Yellow", value: "#eab308" },
  { name: "Orange", value: "#f97316" }, { name: "Red", value: "#ef4444" },
];
const SHAPES = [
  { label: "Text Only", value: "text" }, { label: "Rounded", value: "rounded" }, { label: "Rounded Rect", value: "rounded_rect" },
  { label: "Pill", value: "pill" }, { label: "Circle", value: "circle" }, { label: "Oval", value: "oval" },
  { label: "Underline", value: "underline" }, { label: "Diamond", value: "diamond" }, { label: "Hexagon", value: "hexagon" },
  { label: "Parallelogram", value: "parallelogram" }, { label: "Speech Bubble", value: "speech_bubble" }, { label: "Cylinder", value: "cylinder" },
  { label: "Cloud", value: "cloud_rect" },
];

const SHAPE_MAP: Record<string, ShapeKind> = {
  text: "plain_text",
  rounded: "rounded",
  rounded_rect: "rounded_rect",
  pill: "pill",
  circle: "circle",
  oval: "oval",
  underline: "underline",
  diamond: "diamond",
  hexagon: "hexagon",
  parallelogram: "parallelogram",
  speech_bubble: "speech_bubble",
  cylinder: "cylinder",
  cloud_rect: "cloud_rect",
  trapezoid: "trapezoid",
  triangle: "triangle",
  star: "star",
};

function legacyShape(kind?: ShapeKind) {
  if (kind === "rectangle") return "rounded";
  if (kind === "box") return "rounded_rect";
  if (kind === "ellipse") return "circle";
  if (kind === "cloud") return "cloud_rect";
  if (kind === "sticky" || kind === "sticky_note") return "rounded_rect";
  if (kind === "plain_text") return "text";
  return kind ?? "rounded";
}

function ColorButton({
  label,
  value,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={value === "none" ? undefined : label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={`relative flex h-5 w-5 items-center justify-center rounded-md border transition-transform hover:scale-105 ${selected ? "scale-110 border-orange-500 ring-2 ring-orange-500/20" : "border-slate-200 dark:border-slate-700"}`}
      style={{ backgroundColor: value === "none" ? "transparent" : value }}
    >
      {value === "none" && <span className="text-[8px] font-bold text-slate-400">Ø</span>}
    </button>
  );
}

export function WorkspaceNodeStylePopover({
  kind,
  style,
  onClose,
  onShape,
  updateStyle,
}: {
  kind?: ShapeKind;
  style?: BlockStyle;
  onClose: () => void;
  onShape: (kind: ShapeKind) => void;
  updateStyle: (patch: Partial<BlockStyle>) => void;
}) {
  const currentShape = legacyShape(kind);
  const background = style?.backgroundColor ?? "#ffffff";
  const opacity = Math.round((style?.backgroundOpacity ?? 1) * 100);
  const border = style?.borderColor ?? "#64748b";
  const width = style?.borderWidth ?? 1.5;
  const dash = style?.borderDash ?? "solid";
  const backgroundOptions = BG_COLORS.some((color) => color.value.toLowerCase() === background.toLowerCase())
    ? BG_COLORS
    : [{ name: "Current", value: background }, ...BG_COLORS];
  const borderOptions = border === "none" || SOLID_COLORS.some((color) => color.value.toLowerCase() === border.toLowerCase())
    ? SOLID_COLORS
    : [{ name: "Current", value: border }, ...SOLID_COLORS];

  return (
    <SmartPopover defaultH="left" onClose={onClose}>
      <div className="flex w-[270px] select-none flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Style Node</span>
          <button type="button" onClick={onClose} title="Close" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div>
          <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Shape</span>
          <div className="grid grid-cols-6 gap-1 rounded-xl border border-slate-100 bg-slate-50/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/50">
            {SHAPES.map((shape) => (
              <button
                key={shape.value}
                type="button"
                title={shape.label}
                aria-label={shape.label}
                aria-pressed={currentShape === shape.value}
                onClick={() => onShape(SHAPE_MAP[shape.value])}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-all hover:scale-105 ${currentShape === shape.value ? "border border-orange-400 bg-white text-orange-600 shadow-sm dark:bg-slate-800 dark:text-orange-400" : "text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"}`}
              >
                {renderShapeIcon(shape.value)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Background</span>
            <span className="font-mono text-[9.5px] font-semibold text-slate-500">{opacity}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              aria-label="Custom background color"
              type="color"
              value={background.startsWith("#") ? background : "#ffffff"}
              onChange={(event) => updateStyle({ backgroundColor: event.target.value })}
              className="h-5 w-5 cursor-pointer rounded-md border border-slate-200 p-0 dark:border-slate-700"
              title="Custom background color"
            />
            {backgroundOptions.map((color) => <ColorButton key={color.value} label={color.name} value={color.value} selected={background.toLowerCase() === color.value.toLowerCase()} onClick={() => updateStyle({ backgroundColor: color.value })} />)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[8.5px] font-bold uppercase text-slate-400">Opacity</span>
            <input aria-label="Background opacity" type="range" min="10" max="100" value={opacity} onChange={(event) => updateStyle({ backgroundOpacity: Number(event.target.value) / 100 })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-orange-500 dark:bg-slate-800" />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Border</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <ColorButton label="No border" value="none" selected={border === "none"} onClick={() => updateStyle({ borderColor: "none" })} />
            <input
              aria-label="Custom border color"
              type="color"
              value={border.startsWith("#") ? border : "#64748b"}
              onChange={(event) => updateStyle({ borderColor: event.target.value })}
              className="h-5 w-5 cursor-pointer rounded-md border border-slate-200 p-0 dark:border-slate-700"
              title="Custom border color"
            />
            {borderOptions.map((color) => <ColorButton key={color.value} label={color.name} value={color.value} selected={border.toLowerCase() === color.value.toLowerCase()} onClick={() => updateStyle({ borderColor: color.value })} />)}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 pt-1 dark:border-slate-800">
          <div className="flex flex-1 items-center gap-1">
            {([1, 1.5, 2, 3] as const).map((value) => (
              <button key={value} type="button" title={`Width ${value}px`} aria-pressed={width === value} onClick={() => updateStyle({ borderWidth: value })} className={`flex h-6 flex-1 items-center justify-center rounded-md border transition-colors ${width === value ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-800"}`}>
                <span className={`rounded-full bg-slate-800 dark:bg-slate-200 ${value === 1 ? "h-1.5 w-1.5" : value === 1.5 ? "h-2.5 w-2.5" : value === 2 ? "h-3 w-3" : "h-4 w-4"}`} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(["solid", "dashed", "dotted"] as const).map((value) => (
              <button key={value} type="button" title={value} aria-label={value} aria-pressed={dash === value} onClick={() => updateStyle({ borderDash: value })} className={`flex h-6 items-center justify-center rounded-md border px-1.5 transition-colors ${dash === value ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-800"}`}>
                <svg width="20" height="4" viewBox="0 0 20 4"><line x1="1" y1="2" x2="19" y2="2" stroke={dash === value ? "#f97316" : "#94a3b8"} strokeWidth="2" strokeDasharray={value === "dashed" ? "5,3" : value === "dotted" ? "2,2" : undefined} strokeLinecap="round" /></svg>
              </button>
            ))}
          </div>
        </div>

      </div>
    </SmartPopover>
  );
}
