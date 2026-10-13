"use client";

import React from "react";
import type { ShapeKind } from "../types/block";
import { renderShapeIcon as renderLegacyShapeIcon } from "../../mindmap/components/toolbar/renderShapeIcon";

/** Small visual shape preview for the shape picker.
 *  Keep these previews aligned with the legacy engine toolbar icons. */
export function WorkspaceShapePreviewIcon({ kind }: { kind: ShapeKind }) {
  const legacyKind = kind === "rectangle" ? "rounded"
    : kind === "box" ? "rounded_rect"
    : kind === "ellipse" ? "circle"
    : kind === "slant" ? "parallelogram"
    : kind === "callout" ? "speech_bubble"
    : kind === "cloud" ? "cloud_rect"
    : kind === "sticky" ? "sticky_note"
    : kind;

  if (legacyKind !== "sticky_note") return renderLegacyShapeIcon(legacyKind);

  return <svg width="24" height="18" viewBox="0 0 28 20" fill="none" className="h-4 w-5 shrink-0 stroke-current">
    <path d="M2 2H22L26 6V18H2Z" strokeWidth="1.8" />
    <path d="M22 2V6H26" strokeWidth="1.8" />
  </svg>;
}

export default WorkspaceShapePreviewIcon;
