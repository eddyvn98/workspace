"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { SlideDeckPayload, SlideStatus } from "../../types/slide";
import { SlideThumbnail } from "./SlideThumbnail";
import { WorkspaceSmartPopover as SmartPopover } from "../../utils/WorkspaceSmartPopover";
import { SLIDE_LAYOUT_CHOICES } from "../../utils/slideLayoutTemplates";
import type { SlideLayout } from "@/app/api/workspaces/[id]/agent/slideLayouts";

export interface SlideFilmstripProps {
  data: SlideDeckPayload;
  readOnly?: boolean;
  orientation?: "horizontal" | "vertical";
  onSelect: (id: string) => void;
  onAdd: (layout?: SlideLayout) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetStatus: (id: string, status: SlideStatus | undefined) => void;
  onSetBackground: (id: string, color: string | undefined) => void;
  onSetNotes: (id: string, notes: string) => void;
  onSetHidden: (id: string, hidden: boolean) => void;
}

/** Horizontal scrollable strip of slide thumbnails, the deck's own reordering
 *  surface (native HTML5 drag-and-drop - no extra dependency needed for a
 *  single-axis list reorder). */
export function SlideFilmstrip({
  data, readOnly = false, orientation = "horizontal", onSelect, onAdd, onReorder, onRename, onDuplicate, onDelete, onSetStatus, onSetBackground, onSetNotes, onSetHidden,
}: SlideFilmstripProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const vertical = orientation === "vertical";
  return (
    <nav aria-label="Presentation slides" className={vertical
      ? "flex h-28 w-full shrink-0 items-center gap-2 overflow-x-auto border-t border-slate-200 bg-slate-50 p-2 lg:h-full lg:w-48 lg:flex-col lg:items-stretch lg:overflow-x-hidden lg:overflow-y-auto lg:border-t-0 lg:border-r lg:p-3 dark:border-slate-800 dark:bg-slate-900"
      : "flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/60"}>
      {vertical && <div className="hidden items-center justify-between px-1 text-xs font-semibold text-slate-600 lg:flex dark:text-slate-300"><span>Slides</span><span>{data.slideOrder.length}</span></div>}
      {data.slideOrder.map((id, index) => {
        const slide = data.slides[id];
        if (!slide) return null;
        return (
          <SlideThumbnail
            key={id}
            slide={slide}
            theme={data.theme}
            aspectRatio={data.aspectRatio}
            index={index}
            vertical={vertical}
            readOnly={readOnly}
            isActive={data.activeSlideId === id}
            canDelete={data.slideOrder.length > 1}
            onSelect={() => onSelect(id)}
            onDragStart={setDragIndex}
            onDragOver={() => {}}
            onDrop={() => {
              if (dragIndex !== null) onReorder(dragIndex, index);
              setDragIndex(null);
            }}
            onRename={(name) => onRename(id, name)}
            onDuplicate={() => onDuplicate(id)}
            onDelete={() => onDelete(id)}
            onSetStatus={(status) => onSetStatus(id, status)}
            onSetBackground={(color) => onSetBackground(id, color)}
            onSetNotes={(notes) => onSetNotes(id, notes)}
            onSetHidden={(hidden) => onSetHidden(id, hidden)}
          />
        );
      })}
      <div className={vertical ? "relative shrink-0 md:w-full" : "relative shrink-0"}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          disabled={readOnly}
          onClick={() => setPickerOpen((v) => !v)}
          className={vertical ? "flex h-14 w-14 items-center justify-center gap-2 md:h-12 md:w-full rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800" : "flex h-16 w-16 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:border-slate-700"}
          aria-label="Add slide"
          title="Add slide"
        >
          <Plus className="h-5 w-5" />{vertical && <span className="hidden md:inline">New slide</span>}
        </button>
        {pickerOpen && (
          <SmartPopover defaultH="left" className="!z-50" onClose={() => setPickerOpen(false)}>
            <div className="w-48 p-1 text-xs" role="menu" aria-label="Slide layout">
              {SLIDE_LAYOUT_CHOICES.map(({ layout, label }) => (
                <button
                  key={layout}
                  type="button"
                  role="menuitem"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onAdd(layout); setPickerOpen(false); }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </SmartPopover>
        )}
      </div>
    </nav>
  );
}

export default SlideFilmstrip;
