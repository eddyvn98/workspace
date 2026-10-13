"use client";

import React from "react";
import { MessageCircle } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/**
 * Small unresolved-count badge, old-app CommentBadge equivalent.
 * Rendered by BlockFrame for any block with at least one unresolved comment.
 * Clicking the badge opens the comment composer for that block.
 */
export function CommentBadge({ blockId }: { blockId: string }) {
  const unresolvedCount = useWorkspaceStore(
    (state) => state.comments.filter((c) => c.blockId === blockId && !c.resolved).length
  );
  const setActiveCommentBlockId = useWorkspaceStore((state) => state.setActiveCommentBlockId);

  if (unresolvedCount === 0) return null;

  const displayCount = unresolvedCount > 9 ? "9+" : String(unresolvedCount);
  const tooltip = `${unresolvedCount} unresolved comment${unresolvedCount > 1 ? "s" : ""}`;

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        setActiveCommentBlockId(blockId);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        borderRadius: 9999,
        backgroundColor: "#f97316",
        color: "#ffffff",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        padding: "3px 6px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
        zIndex: 25,
        cursor: "pointer",
        border: "1.5px solid #ffffff",
        transition: "transform 0.15s ease, background-color 0.15s ease",
      }}
      className="hover:scale-110 active:scale-95 hover:bg-orange-600"
    >
      <MessageCircle className="h-2.5 w-2.5" />
      <span>{displayCount}</span>
    </button>
  );
}

export default CommentBadge;
