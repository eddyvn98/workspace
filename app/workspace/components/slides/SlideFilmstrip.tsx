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
  data, onSelect, onAdd, onReorder, onRename, onDuplicate, onDelete, onSetStatus, onSetBackground, onSetNotes, onSetHidden,
}: SlideFilmstripProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/60">
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
      <div className="relative shrink-0">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setPickerOpen((v) => !v)}
          className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 dark:border-slate-700"
          aria-label="Add slide"
          title="Add slide"
        >
          <Plus className="h-5 w-5" />
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
    </div>
  );
}

export default SlideFilmstrip;
