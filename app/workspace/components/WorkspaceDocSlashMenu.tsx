"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlashCommandItem } from "../extensions/docSlashCommand";

/**
 * The floating popup driven by docSlashCommand.ts's state — a plain list of
 * block-type options, grouped into sections (a faint divider between groups)
 * with each row's icon + description shown only while hovered/keyboard-
 * selected (Notion's own affordance), not all at once, to keep the list
 * scannable. Positioned via clientRect() (the "/" trigger's own screen
 * position from @tiptap/suggestion) rather than any line-lookup math, since
 * unlike WorkspaceDocLineOverlay's ⋮ button this only ever needs to track
 * the caret, not a specific paragraph's row.
 */
export function WorkspaceDocSlashMenu({
  items,
  clientRect,
  selectedIndex,
  onSelect,
  menuId,
  onHighlight,
}: {
  items: SlashCommandItem[];
  clientRect: () => DOMRect | null;
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
  menuId?: string;
  onHighlight?: (index: number) => void;
}) {
  const fallbackId = useId();
  const id = menuId || fallbackId;
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const rect = clientRect();
      if (!rect) { setPosition(null); return; }
      const height = Math.min(listRef.current?.scrollHeight || 320, 320);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const openBelow = below >= height || below >= above;
      const maxHeight = Math.max(48, Math.min(320, openBelow ? below : above));
      const next = {
        top: Math.max(8, openBelow ? rect.bottom + 6 : rect.top - Math.min(height, maxHeight) - 6),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - (listRef.current?.offsetWidth || 240) - 8)),
        maxHeight,
      };
      setPosition(previous => previous?.top === next.top && previous.left === next.left && previous.maxHeight === next.maxHeight ? previous : next);
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [clientRect, items, selectedIndex]);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>(`[data-option-index="${selectedIndex}"]`);
    if (!list || !selected) return;
    if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
    else if (selected.offsetTop + selected.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
  }, [selectedIndex, items, position?.maxHeight]);

  if (!position || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={listRef}
      id={id}
      role="listbox"
      aria-label="Document commands"
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 py-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={position}
    >
      {!items.length && <div role="status" className="px-3 py-3 text-sm text-slate-500">No commands found. Press Escape to close.</div>}
      {items.map((item, index) => {
        const Icon = item.icon;
        const showDivider = index > 0 && items[index - 1].group !== item.group;
        return (
          <React.Fragment key={`${item.label}:${item.tableId || index}`}>
            {showDivider && <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />}
            <button
              type="button"
              id={`${id}-option-${index}`}
              data-option-index={index}
              role="option"
              aria-selected={index === selectedIndex}
              aria-label={`${item.label}. ${item.description}`}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHighlight?.(index)}
              onClick={() => onSelect(item)}
              className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${
                index === selectedIndex ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" : "text-slate-700 dark:text-slate-200"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex flex-col gap-0.5">
                <span>{item.label}</span>
                {index === selectedIndex && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">{item.description}</span>
                )}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
}

export default WorkspaceDocSlashMenu;
