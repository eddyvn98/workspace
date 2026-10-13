"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";

interface WorkspaceAiNodePromptProps {
  isRunning: boolean;
  placeBelow?: boolean;
  onSubmit: (request: string) => void;
  onClose: () => void;
}

/**
 * Prompt box for the toolbar's "Edit / Expand with AI" button — legacy's
 * PageAiModal, as a popover rather than a modal to match how every other
 * control on this toolbar opens.
 */
export function WorkspaceAiNodePrompt({ isRunning, placeBelow, onSubmit, onClose }: WorkspaceAiNodePromptProps) {
  const [request, setRequest] = useState("");

  const submit = () => {
    if (!request.trim() || isRunning) return;
    onSubmit(request.trim());
    onClose();
  };

  return (
    <SwatchPopover isOpen onClose={onClose} title="Edit / Expand with AI" showTitle placeBelow={placeBelow}>
      <div {...workspaceKeyboardScope("ai-node-prompt")} className="flex w-[260px] flex-col gap-2">
        <textarea
          autoFocus
          rows={3}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. list 5 sub-topics, or rewrite this shorter"
          className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-orange-400 dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400">A list adds branches; one line rewrites this node.</span>
          <button
            type="button"
            disabled={!request.trim() || isRunning}
            onClick={submit}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Run
          </button>
        </div>
      </div>
    </SwatchPopover>
  );
}
