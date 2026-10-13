"use client";

import { Link2 } from "lucide-react";
import type { WorkspaceChatMessage } from "../types/chat";
import { focusWorkspaceBlocks } from "../utils/workspaceCameraFocus";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { extractBlockLabel } from "../utils/workspaceChatContext";

const MAX_VISIBLE_REFERENCES = 3;

export default function WorkspaceChatReferenceChips({ references }: {
  references: NonNullable<WorkspaceChatMessage["references"]>;
}) {
  const blocks = useWorkspaceStore((state) => state.blocks);
  if (!references.length) return null;
  const unique = references.filter((reference, index, all) => {
    const id = reference.blockId ?? reference.filename ?? reference.excerpt ?? `source-${index}`;
    return all.findIndex((candidate, candidateIndex) =>
      (candidate.blockId ?? candidate.filename ?? candidate.excerpt ?? `source-${candidateIndex}`) === id) === index;
  });
  const visible = unique.slice(0, MAX_VISIBLE_REFERENCES);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
      <Link2 className="h-3 w-3 shrink-0 text-slate-400" />
      {visible.map((reference, index) => {
        const block = reference.blockId ? blocks[reference.blockId] : undefined;
        return (
          <button
            key={`${reference.blockId ?? reference.filename ?? reference.excerpt ?? "source"}-${index}`}
            type="button"
            disabled={!block}
            onClick={(event) => {
              event.stopPropagation();
              if (reference.blockId) focusWorkspaceBlocks([reference.blockId]);
            }}
            title={reference.excerpt}
            className={`max-w-[140px] truncate rounded-full border px-2 py-0.5 text-[10px] ${block
              ? "cursor-pointer border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-orange-500/50 dark:hover:text-orange-400"
              : "cursor-default border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500"}`}
          >
            {block ? extractBlockLabel(block) : reference.filename || "Source"}
          </button>
        );
      })}
      {unique.length > visible.length && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500">+{unique.length - visible.length} more</span>
      )}
    </div>
  );
}
