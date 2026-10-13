"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Pencil,
  Highlighter,
  Eraser,
  Slash,
  Square,
  Circle,
  MoveRight,
  Type,
} from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { FreehandToolType } from "../types/block";
import {
  PATH_STROKE_SWATCHES,
  PATH_WIDTH_OPTIONS,
  useFreehandConfig,
} from "../utils/freehandPresets";

interface ToolOption {
  type: FreehandToolType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function PolylineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 17l6-10l5 7l7-9" />
    </svg>
  );
}

const TOOLS: ToolOption[] = [
  { type: "pen", label: "Pen", icon: Pencil },
  { type: "highlighter", label: "Highlighter", icon: Highlighter },
  { type: "eraser", label: "Eraser", icon: Eraser },
  { type: "line", label: "Line", icon: Slash },
  { type: "polyline", label: "Polyline", icon: PolylineIcon },
  { type: "square", label: "Square", icon: Square },
  { type: "circle", label: "Circle", icon: Circle },
  { type: "arrow_line", label: "Arrow Line", icon: MoveRight },
  { type: "text", label: "Add Text", icon: Type },
];

export function FreehandToolPicker() {
  const isDrawMode = useWorkspaceStore((state) => state.isDrawMode);
  const setIsDrawMode = useWorkspaceStore((state) => state.setIsDrawMode);
  const activeFreehandTool = useWorkspaceStore((state) => state.activeFreehandTool);
  const setActiveFreehandTool = useWorkspaceStore((state) => state.setActiveFreehandTool);

  const strokeColor = useFreehandConfig((state) => state.strokeColor);
  const setStrokeColor = useFreehandConfig((state) => state.setStrokeColor);
  const strokeWidth = useFreehandConfig((state) => state.strokeWidth);
  const setStrokeWidth = useFreehandConfig((state) => state.setStrokeWidth);
  const [openPicker, setOpenPicker] = useState<"color" | "width" | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const togglePicker = (key: "color" | "width", event: React.MouseEvent<HTMLButtonElement>) => {
    if (openPicker === key) {
      setOpenPicker(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setPickerAnchor({ left: bounds.left + bounds.width / 2, top: bounds.top - 8 });
    setOpenPicker(key);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenPicker(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isDrawMode) return null;

  return (
    <div ref={containerRef} className="flex items-center gap-2" role="toolbar" aria-label="Freehand drawing tools">
      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 dark:border-slate-800">
        {TOOLS.slice(0, 3).map((tool) => {
          const Icon = tool.icon;
          const isActive = activeFreehandTool === tool.type;
          return (
            <button
              key={tool.type}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={isActive}
              onClick={() => isActive ? setIsDrawMode(false) : setActiveFreehandTool(tool.type)}
              className={`flex items-center justify-center rounded-full p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${isActive ? "bg-orange-500 text-white shadow-sm hover:bg-orange-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 border-r border-slate-200 pr-2 dark:border-slate-800">
        {TOOLS.slice(3).map((tool) => {
          const Icon = tool.icon;
          const isActive = activeFreehandTool === tool.type || (tool.type === "line" && activeFreehandTool === "cad_line");
          return (
            <button
              key={tool.type}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={isActive}
              onClick={() => isActive ? setIsDrawMode(false) : setActiveFreehandTool(tool.type)}
              className={`flex items-center justify-center rounded-full p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${isActive ? "bg-orange-500 text-white shadow-sm hover:bg-orange-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {activeFreehandTool !== "eraser" && (
        <>
          <div className="relative border-r border-slate-200 pr-2 dark:border-slate-800">
            <button
              type="button"
              title="Choose color"
              aria-label="Choose color"
              onClick={(event) => togglePicker("color", event)}
              className="flex items-center gap-1 rounded-full p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span className="h-4 w-4 rounded-full border border-slate-300 shadow-sm dark:border-slate-700" style={{ backgroundColor: strokeColor }} />
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {openPicker === "color" && (
              <div style={{ left: pickerAnchor?.left ?? 0, top: pickerAnchor?.top ?? 0, transform: "translate(-50%, -100%)" }} className="fixed z-[100] flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                {PATH_STROKE_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={`Color ${color}`}
                    aria-label={`Color ${color}`}
                    onClick={() => {
                      setStrokeColor(color);
                      setOpenPicker(null);
                    }}
                    className={`h-5 w-5 rounded-full transition-transform hover:scale-105 cursor-pointer ${strokeColor === color ? "scale-110 ring-2 ring-orange-500 ring-offset-1" : ""}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              title="Choose stroke width"
              aria-label="Choose stroke width"
              onClick={(event) => togglePicker("width", event)}
              className="flex items-center gap-1 rounded-full p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <span className="rounded-full bg-slate-700 dark:bg-slate-200" style={{ width: Math.max(3, Math.min(10, strokeWidth)), height: Math.max(3, Math.min(10, strokeWidth)) }} />
              </span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {openPicker === "width" && (
              <div style={{ left: pickerAnchor?.left ?? 0, top: pickerAnchor?.top ?? 0, transform: "translate(-50%, -100%)" }} className="fixed z-[100] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                {PATH_WIDTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={`${option.label} (${option.value}px)`}
                    aria-label={`${option.label} stroke width`}
                    onClick={() => {
                      setStrokeWidth(option.value);
                      setOpenPicker(null);
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${strokeWidth === option.value ? "scale-105 ring-2 ring-orange-500 ring-offset-1" : ""}`}
                  >
                    <span className="rounded-full bg-slate-700 dark:bg-slate-200" style={{ width: Math.max(3, Math.min(12, option.value)), height: Math.max(3, Math.min(12, option.value)) }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default FreehandToolPicker;
