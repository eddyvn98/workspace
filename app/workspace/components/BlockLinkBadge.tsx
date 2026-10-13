"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { normalizeBlockLink } from "../utils/link";

export interface BlockLinkBadgeProps {
  link?: string;
}

/**
 * Small badge rendered on the bottom-right corner of a block when a link is attached.
 * Clicking it opens the link in a new browser tab.
 */
export const BlockLinkBadge: React.FC<BlockLinkBadgeProps> = ({ link }) => {
  if (!link || !link.trim()) return null;

  const normalized = normalizeBlockLink(link);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (normalized) {
      window.open(normalized, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      title={normalized ? `Open link: ${normalized}` : `Open link: ${link}`}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: -8,
        right: -8,
        width: 20,
        height: 20,
        borderRadius: "50%",
        backgroundColor: "#ffffff",
        color: "#2563eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        border: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 16,
        transition: "transform 0.15s ease, background-color 0.15s ease",
      }}
      className="hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
    >
      <ExternalLink className="h-3 w-3" />
    </div>
  );
};

export default BlockLinkBadge;
