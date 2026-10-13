"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import type { WorkspaceCollapseDirection } from "../layout/collapseDirection";

export function CollapseGlyph({ direction, isCollapsed }: { direction: WorkspaceCollapseDirection; isCollapsed: boolean }) {
  if (direction === "horizontal") {
    return <span data-workspace-collapse-glyph="horizontal" className="inline-flex items-center gap-0">
      <ChevronLeft size={9} /><ChevronRight size={9} />
    </span>;
  }
  if (direction === "vertical") {
    return <span data-workspace-collapse-glyph="vertical" className="inline-flex items-center gap-0">
      <ChevronUp size={9} /><ChevronDown size={9} />
    </span>;
  }

  const actionSide = isCollapsed
    ? direction
    : ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[direction];
  const Icon = actionSide === "left" ? ChevronLeft
    : actionSide === "right" ? ChevronRight
      : actionSide === "top" ? ChevronUp : ChevronDown;
  return <span data-workspace-collapse-glyph={actionSide} className="inline-flex items-center">
    <Icon size={12} />
  </span>;
}
