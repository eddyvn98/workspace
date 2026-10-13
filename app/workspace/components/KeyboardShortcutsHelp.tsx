"use client";

import React, { useEffect } from "react";
import { HelpCircle, X } from "lucide-react";

export interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export type ShortcutEntry = [label: string, key: string];

const SHORTCUT_SECTIONS: Array<{ title: string; items: ShortcutEntry[] }> = [
  {
    title: "Node Operations",
    items: [
      ["Create child node", "Tab | Insert"],
      ["Create sibling node", "Enter"],
      ["Create parent node", "Shift + Tab"],
      ["Move up", "Ctrl / ⌘ + ↑"],
      ["Move down", "Ctrl / ⌘ + ↓"],
      ["Create summary node", "Ctrl / ⌘ + G"],
      ["Collapse / Expand", "/"],
      ["Delete node", "Delete | Backspace"],
      ["Delete & keep children", "Shift + Backspace"],
      ["Copy node", "Ctrl / ⌘ + C"],
      ["Cut node", "Ctrl / ⌘ + X"],
      ["Paste node", "Ctrl / ⌘ + V"],
      ["Edit text", "F2 | Double Click"],
      ["Edit description", "Hold Shift + double-click the description"],
      ["New line", "Shift + Enter"],
      ["Undo", "Ctrl / ⌘ + Z"],
      ["Redo", "Ctrl + Y / ⌘ + Shift + Z"],
      ["Select multiple nodes", "Ctrl / ⌘ + Click"],
      ["Find & Replace", "Ctrl / ⌘ + F"],
    ],
  },
  {
    title: "Canvas Operations",
    items: [
      ["Zoom In", "Ctrl / ⌘ + +"],
      ["Zoom Out", "Ctrl / ⌘ + -"],
      ["Quick Zoom", "Mouse wheel | Trackpad pinch"],
      ["Go to Root Node", "Ctrl / ⌘ + Enter"],
      ["Fit to view", "Ctrl / ⌘ + I"],
      ["Drag / Pan", "Click & drag canvas"],
    ],
  },
  {
    title: "Outline Panel Operations",
    items: [
      ["New line", "Shift + Enter"],
      ["Delete selected node", "Delete"],
      ["Indent (Child node)", "Tab"],
      ["Create sibling node", "Enter"],
      ["Outdent (Parent level)", "Shift + Tab"],
    ],
  },
];

export const KEYBOARD_SHORTCUTS = SHORTCUT_SECTIONS.flatMap(({ items }) => items).map(
  ([description, combo]) => ({ combo, description }),
);

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="workspace-shortcuts-title" className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-orange-500" /><span id="workspace-shortcuts-title" className="text-sm font-bold">System Keyboard Shortcuts Guide</span></div>
          <button type="button" onClick={onClose} aria-label="Close keyboard shortcuts guide" title="Close keyboard shortcuts guide" className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6 scrollbar-thin">
          {SHORTCUT_SECTIONS.map((section) => <ShortcutSection key={section.title} title={section.title} items={section.items} />)}
        </div>
      </div>
    </div>
  );
}

function ShortcutSection({ title, items }: { title: string; items: ShortcutEntry[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-orange-500">{title}</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {items.map(([label, key]) => <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-400">{label}</span><kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{key}</kbd></div>)}
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;
