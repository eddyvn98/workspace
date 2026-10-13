"use client";

import * as React from "react";
import { ChevronUp, ChevronDown, Pencil, X, Zap, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceQueuedSend } from "../types/chat";

interface WorkspaceChatQueueTrayProps {
  queue: WorkspaceQueuedSend[];
  onEdit: (queueId: string, newQuery: string) => void;
  onMove: (queueId: string, direction: "up" | "down") => void;
  onCancel: (queueId: string) => void;
  onSendNow: (queueId: string) => void;
}

function QueueRow({
  item,
  index,
  total,
  onEdit,
  onMove,
  onCancel,
  onSendNow,
}: {
  item: WorkspaceQueuedSend;
  index: number;
  total: number;
  onEdit: (queueId: string, newQuery: string) => void;
  onMove: (queueId: string, direction: "up" | "down") => void;
  onCancel: (queueId: string) => void;
  onSendNow: (queueId: string) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.query);

  React.useEffect(() => {
    if (!isEditing) setDraft(item.query);
  }, [item.query, isEditing]);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.query) onEdit(item.id, trimmed);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-lg px-2 py-1",
        "bg-slate-50 border border-slate-200",
        "dark:bg-slate-800/60 dark:border-slate-700",
      )}
    >
      <span className="flex-shrink-0 text-[9px] font-semibold text-slate-400 dark:text-slate-500 w-3 text-center">
        {index + 1}
      </span>

      {isEditing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === "Escape") {
              setDraft(item.query);
              setIsEditing(false);
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-left text-[11px] text-slate-600 dark:text-slate-300">
          {item.query}
        </span>
      )}

      {/* Hidden until hover, like Codex's queued-prompt row. */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Move up"
          disabled={index === 0}
          onClick={() => onMove(item.id, "up")}
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Move down"
          disabled={index === total - 1}
          onClick={() => onMove(item.id, "down")}
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Edit"
          onClick={() => setIsEditing(true)}
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Send now (interrupts the current response)"
          onClick={() => onSendNow(item.id)}
          className="p-0.5 rounded text-orange-500 hover:text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors"
        >
          <Zap className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Delete"
          onClick={() => onCancel(item.id)}
          className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

export function WorkspaceChatQueueTray({
  queue,
  onEdit,
  onMove,
  onCancel,
  onSendNow,
}: WorkspaceChatQueueTrayProps) {
  if (queue.length === 0) return null;

  return (
    <div className="shrink-0 px-3 pt-2">
      <div className="flex items-center gap-1 mb-1 px-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Clock3 className="w-2.5 h-2.5" />
        Queued · {queue.length}
      </div>
      <div className="flex flex-col gap-1">
        {queue.map((item, index) => (
          <QueueRow
            key={item.id}
            item={item}
            index={index}
            total={queue.length}
            onEdit={onEdit}
            onMove={onMove}
            onCancel={onCancel}
            onSendNow={onSendNow}
          />
        ))}
      </div>
    </div>
  );
}

export default WorkspaceChatQueueTray;
