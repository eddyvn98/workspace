"use client";

import React, { useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export function WorkspaceTitleBar() {
  const title = useWorkspaceStore((state) => state.title);
  const setTitle = useWorkspaceStore((state) => state.setTitle);
  const [draft, setDraft] = useState(title);
  const [isEditing, setIsEditing] = useState(false);

  const commit = () => {
    const trimmed = draft.trim();
    setTitle(trimmed || "Untitled");
    setIsEditing(false);
  };

  return (
    <div
      className="min-w-0 px-1 py-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(title);
              setIsEditing(false);
            }
          }}
          className="w-48 bg-transparent text-sm font-medium text-slate-800 outline-none dark:text-slate-100"
        />
      ) : (
        <button
          type="button"
          title="Rename workspace"
          onClick={() => {
            setDraft(title);
            setIsEditing(true);
          }}
          className="max-w-[7rem] truncate text-sm font-semibold text-slate-800 hover:text-orange-600 dark:text-slate-100 dark:hover:text-orange-400 sm:max-w-[16rem] sm:text-base"
        >
          {title}
        </button>
      )}
    </div>
  );
}

export default WorkspaceTitleBar;
