"use client";

import React, { useEffect, useState } from "react";
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
}: {
  items: SlashCommandItem[];
  clientRect: () => DOMRect | null;
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(clientRect());
  }, [clientRect, items, selectedIndex]);

  if (!rect || items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 max-h-[320px] min-w-[240px] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 py-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={{ top: rect.bottom + 6, left: rect.left }}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const showDivider = index > 0 && items[index - 1].group !== item.group;
        return (
          <React.Fragment key={item.label}>
            {showDivider && <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
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
