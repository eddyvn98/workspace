"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type CanvasBlock,
  type ShapeKind,
  createBlockId,
  createDualTransform,
} from "../types/block";
import { Check, MousePointerClick, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceShapePreviewIcon } from "./WorkspaceShapePreviewIcon";

const SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "rectangle", label: "Rectangle" },
  { kind: "box", label: "Box" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "oval", label: "Oval" },
  { kind: "diamond", label: "Diamond" },
  { kind: "triangle", label: "Triangle" },
  { kind: "hexagon", label: "Hexagon" },
  { kind: "star", label: "Star" },
  { kind: "pill", label: "Pill" },
  { kind: "slant", label: "Slant" },
  { kind: "parallelogram", label: "Parallelogram" },
  { kind: "callout", label: "Callout" },
  { kind: "speech_bubble", label: "Speech Bubble" },
  { kind: "cylinder", label: "Cylinder" },
  { kind: "cloud", label: "Cloud" },
  { kind: "sticky", label: "Sticky" },
  { kind: "underline", label: "Underline" },
  { kind: "plain_text", label: "Plain Text" },
];

const LEGACY_SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "rectangle", label: "Rect" },
  { kind: "box", label: "Box" },
  { kind: "ellipse", label: "Circle" },
  { kind: "oval", label: "Oval" },
  { kind: "diamond", label: "Diamond" },
  { kind: "hexagon", label: "Hex" },
  { kind: "parallelogram", label: "Slant" },
  { kind: "speech_bubble", label: "Callout" },
  { kind: "cylinder", label: "Cylinder" },
  { kind: "cloud", label: "Cloud" },
  { kind: "sticky", label: "Sticky" },
];

const BUTTON_CLASS_NAME =
  "rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer";

export function WorkspaceAddShapeButtons({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [isDrawToSize, setIsDrawToSize] = useState(compact);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const armedShapeKind = useWorkspaceStore((state) => state.armedShapeKind);
  const setArmedShapeKind = useWorkspaceStore((state) => state.setArmedShapeKind);
  const setActiveConnectorTool = useWorkspaceStore((state) => state.setActiveConnectorTool);
  const setIsDrawMode = useWorkspaceStore((state) => state.setIsDrawMode);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);

  const blockCount = Object.keys(blocks).length;

  useEffect(() => {
    if (!armedShapeKind) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setArmedShapeKind(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [armedShapeKind, setArmedShapeKind]);

  const handleAddShape = useCallback(
    (shapeKind: ShapeKind) => {
      const offset = (blockCount % 20) * 20;
      const now = Date.now();
      const block: CanvasBlock<"shape"> = {
        id: createBlockId(),
        type: "shape",
        transform: createDualTransform({
          x: 100 + offset,
          y: 100 + offset,
          w: 140,
          h: 140,
          rotation: 0,
          zIndex: blockCount,
        }),
        data: { shapeKind },
        createdAt: now,
        updatedAt: now,
      };
      addBlock(block);
      setSelection([block.id]);
      // See useShapeDrawToSize's onPointerUp: a freshly created shape isn't
      // yet a settled double-click target, so an immediate double-click to
      // label it would type nothing without this.
      setPendingEditBlockId(block.id);
    },
    [addBlock, blockCount, setSelection, setPendingEditBlockId]
  );

  const handleToggleDrawToSize = useCallback(() => {
    if (isDrawToSize) {
      setIsDrawToSize(false);
      setArmedShapeKind(null);
    } else {
      setIsDrawToSize(true);
    }
  }, [isDrawToSize, setArmedShapeKind]);

  const handleShapeClick = useCallback(
    (kind: ShapeKind) => {
      if (isDrawToSize) {
        if (armedShapeKind === kind) {
          setArmedShapeKind(null);
        } else {
          setArmedShapeKind(kind);
          setActiveConnectorTool(null);
          setIsDrawMode(false);
        }
      } else {
        handleAddShape(kind);
      }
      setOpen(false);
    },
    [isDrawToSize, armedShapeKind, setArmedShapeKind, setActiveConnectorTool, setIsDrawMode, handleAddShape]
  );

  if (compact) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={
              armedShapeKind
                ? `Armed shape: ${armedShapeKind} (drag on canvas to draw)`
                : "Draw Shape"
            }
            aria-label={
              armedShapeKind
                ? `Drawing ${armedShapeKind}; activate to cancel`
                : "Draw shape"
            }
            aria-pressed={armedShapeKind !== null}
            className={`flex h-8 w-8 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${
              armedShapeKind !== null
                ? "bg-orange-500 text-white hover:bg-orange-600 hover:text-white shadow-md shadow-orange-500/20"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            <Square className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          className="ml-px w-[196px] rounded-2xl p-2 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 shadow-xl"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Draw Shape
            </span>
            {!compact && armedShapeKind && (
              <button
                type="button"
                onClick={() => setArmedShapeKind(null)}
                className="text-[10px] font-medium text-orange-500 hover:underline cursor-pointer"
              >
                Clear armed
              </button>
            )}
          </div>

          {!compact && <div className="mt-1">
            <button
              type="button"
              onClick={handleToggleDrawToSize}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                isDrawToSize
                  ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>Draw to size</span>
              </div>
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isDrawToSize
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-slate-300 bg-transparent dark:border-slate-600"
                }`}
              >
                {isDrawToSize && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </button>
          </div>}

          {!compact && <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />}

          <div className={`grid ${compact ? "grid-cols-4 gap-1" : "grid-cols-2 gap-1 max-h-60 overflow-y-auto pr-0.5"}`}>
            {(compact ? LEGACY_SHAPES : SHAPES).map(({ kind, label }) => {
              const isArmed = isDrawToSize && armedShapeKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => handleShapeClick(kind)}
                  aria-label={compact ? `Draw ${label} shape` : undefined}
                  title={compact ? `Draw ${label} shape` : isDrawToSize ? `Arm ${label} to draw on canvas` : `Add ${label}`}
                  className={`flex ${compact ? "flex-col items-center gap-0.5 rounded-lg p-1.5 text-[9px]" : "items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs"} transition-colors cursor-pointer ${
                    isArmed
                      ? "bg-orange-100 text-orange-700 font-medium ring-1 ring-orange-400 dark:bg-orange-950/40 dark:text-orange-300"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className={compact ? "flex h-6 w-8 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-8 [&>div]:scale-[1.3]" : "shrink-0"}>
                    <WorkspaceShapePreviewIcon kind={kind} />
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggleDrawToSize}
        title={
          isDrawToSize
            ? "Draw to size mode ON (pick a shape, then drag on canvas)"
            : "Draw to size mode OFF (click shape to place immediately)"
        }
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
          isDrawToSize
            ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        }`}
      >
        <MousePointerClick className="h-3.5 w-3.5" />
        <span>Draw to size</span>
      </button>
      {SHAPES.map(({ kind, label }) => {
        const isArmed = isDrawToSize && armedShapeKind === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => handleShapeClick(kind)}
            title={isDrawToSize ? `Arm ${kind} to draw on canvas` : `Add ${label}`}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
              isArmed
                ? "bg-orange-100 text-orange-700 ring-1 ring-orange-400 dark:bg-orange-950/40 dark:text-orange-300 font-medium"
                : BUTTON_CLASS_NAME
            }`}
          >
            Add {label}
          </button>
        );
      })}
    </>
  );
}

export default WorkspaceAddShapeButtons;
