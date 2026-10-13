"use client";

import React, { useState } from "react";
import { MoreVertical, ChevronRight, Sparkles } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { WorkspaceSmartPopover } from "../utils/WorkspaceSmartPopover";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import { WorkspaceAiNodePrompt } from "./WorkspaceAiNodePrompt";
import { useWorkspaceDocLineActions, type DocLineTurnIntoKind } from "../hooks/useWorkspaceDocLineActions";
import { useWorkspaceDocLineAiEdit } from "../hooks/useWorkspaceDocLineAiEdit";

const TURN_INTO_OPTIONS: Array<[label: string, kind: DocLineTurnIntoKind]> = [
  ["Paragraph", "paragraph"],
  ["Heading 1", "heading1"],
  ["Heading 2", "heading2"],
  ["Heading 3", "heading3"],
  ["Bullet list", "bulletList"],
  ["Ordered list", "orderedList"],
  ["Checklist", "taskList"],
  ["Quote", "blockquote"],
];

const dividerClass = "my-1 border-t border-slate-200 dark:border-slate-800";

/** The ⋮ button + its dropdown for one line inside a doc/slideDeck block —
 *  mounted per hovered line by WorkspaceDocLineOverlay.tsx. Mirrors
 *  BlockContextMenu.tsx's row/divider/flyout conventions one level down. */
export function WorkspaceDocLineMenu({
  editor,
  blockId,
  lineId,
  onOpenChange,
}: {
  editor: Editor;
  blockId: string;
  lineId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // isOpen/onOpenChange (from WorkspaceDocLineOverlay.tsx) pin the hovered
  // line while ANY popover below is open — the dropdown, or the AI prompt it
  // hands off to — since both are portaled outside containerRef and would
  // otherwise vanish the instant the pointer left the ⋮ button on its way in.
  const [menuOpen, setMenuOpenState] = useState(false);
  const [aiPromptOpen, setAiPromptOpenState] = useState(false);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const actions = useWorkspaceDocLineActions(editor, blockId);
  const { isRunning, runLineAiEdit } = useWorkspaceDocLineAiEdit(editor, blockId);

  const setMenuOpen = (value: boolean) => {
    setMenuOpenState(value);
    onOpenChange(value || aiPromptOpen);
  };
  const setAiPromptOpen = (value: boolean) => {
    setAiPromptOpenState(value);
    onOpenChange(value || menuOpen);
  };

  const close = (action: () => void) => () => {
    action();
    setMenuOpen(false);
    setTurnIntoOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <WorkspaceSmartPopover defaultH="left" onClose={() => { setMenuOpen(false); setTurnIntoOpen(false); }}>
          <div
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            className="relative min-w-[170px] rounded-lg border border-slate-200 bg-white/95 py-1 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
          >
            <div className="relative">
              <BlockContextMenuItem onClick={() => setTurnIntoOpen((v) => !v)}>
                <span className="flex items-center justify-between">
                  <span>Turn into</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </span>
              </BlockContextMenuItem>
              {turnIntoOpen && (
                <div className="absolute left-full top-0 ml-1.5 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  {TURN_INTO_OPTIONS.map(([label, kind]) => (
                    <BlockContextMenuItem key={kind} onClick={close(() => actions.turnInto(lineId, kind))}>
                      {label}
                    </BlockContextMenuItem>
                  ))}
                </div>
              )}
            </div>

            <div className={dividerClass} />
            <BlockContextMenuItem onClick={close(() => void actions.copyLink(lineId))}>Copy link to block</BlockContextMenuItem>
            <BlockContextMenuItem onClick={close(() => actions.duplicate(lineId))}>Duplicate</BlockContextMenuItem>
            <BlockContextMenuItem onClick={close(() => actions.moveUp(lineId))}>Move up</BlockContextMenuItem>
            <BlockContextMenuItem onClick={close(() => actions.moveDown(lineId))}>Move down</BlockContextMenuItem>

            <div className={dividerClass} />
            <div className="relative">
              <BlockContextMenuItem onClick={() => { setAiPromptOpen(true); setMenuOpen(false); }}>
                <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />Improve with AI</span>
              </BlockContextMenuItem>
            </div>

            <div className={dividerClass} />
            <BlockContextMenuItem danger onClick={close(() => actions.remove(lineId))}>Delete</BlockContextMenuItem>
          </div>
        </WorkspaceSmartPopover>
      )}

      {aiPromptOpen && (
        <WorkspaceAiNodePrompt
          isRunning={isRunning}
          onSubmit={(request) => void runLineAiEdit(lineId, request)}
          onClose={() => setAiPromptOpen(false)}
        />
      )}
    </div>
  );
}

export default WorkspaceDocLineMenu;
