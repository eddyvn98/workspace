"use client";

import React, { useState } from "react";
import { Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import type { SlideMeta, SlideStatus } from "../../types/slide";
import { SLIDE_STATUS_COLOR, SLIDE_STATUS_LABEL } from "../../types/slide";

const STATUSES: SlideStatus[] = ["not_started", "in_progress", "done"];
const BG_SWATCHES = ["#ffffff", "#f1f5f9", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#1e293b"];

export interface SlideSettingsMenuProps {
  slide: SlideMeta;
  canDelete: boolean;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetStatus: (status: SlideStatus | undefined) => void;
  onSetBackground: (color: string | undefined) => void;
  onSetNotes: (notes: string) => void;
  onSetHidden: (hidden: boolean) => void;
}

/** Popover content for one slide's settings, opened from SlideThumbnail's
 *  kebab button - rename, status (workshop/facilitation progress tracking),
 *  background color, presenter notes, duplicate, delete. */
export function SlideSettingsMenu({ slide, canDelete, onRename, onDuplicate, onDelete, onSetStatus, onSetBackground, onSetNotes, onSetHidden }: SlideSettingsMenuProps) {
  const [name, setName] = useState(slide.name);
  const [notes, setNotes] = useState(slide.presenterNotes ?? "");

  return (
    <div className="w-60 space-y-3 p-3 text-xs" onClick={(event) => event.stopPropagation()}>
      <div>
        <label className="mb-1 block font-medium text-slate-500 dark:text-slate-400">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && onRename(name.trim())}
          className="w-full rounded border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <label className="mb-1 block font-medium text-slate-500 dark:text-slate-400">Status</label>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              title={SLIDE_STATUS_LABEL[s]}
              onClick={() => onSetStatus(slide.status === s ? undefined : s)}
              className={`flex-1 rounded border px-1.5 py-1 ${
                slide.status === s ? "border-slate-400 dark:border-slate-500" : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span className="mx-auto block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SLIDE_STATUS_COLOR[s] }} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block font-medium text-slate-500 dark:text-slate-400">Background</label>
        <div className="flex flex-wrap gap-1.5">
          {BG_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onSetBackground(color === "#ffffff" ? undefined : color)}
              className={`h-5 w-5 rounded-full border ${
                (slide.backgroundColor ?? "#ffffff") === color ? "ring-2 ring-blue-500" : "border-slate-300 dark:border-slate-600"
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Background ${color}`}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block font-medium text-slate-500 dark:text-slate-400">Presenter notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onSetNotes(notes)}
          rows={3}
          placeholder="Only visible to you in Present mode"
          className="w-full resize-none rounded border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <button
        type="button"
        onClick={() => onSetHidden(!slide.hidden)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {slide.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {slide.hidden ? "Show in presentation" : "Hide in presentation"}
      </button>

      <div className="flex gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <button type="button" onClick={onDuplicate} className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? undefined : "A deck needs at least one slide"}
          className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

export default SlideSettingsMenu;
