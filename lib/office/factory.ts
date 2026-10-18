import { createBlockId, createDualTransform, type CanvasBlock } from "@/app/workspace/types/block";
import { createWorkspaceTableBlock } from "@/app/workspace/utils/workspaceTableFactory";
import { normalizeSlideDeckData } from "@/app/workspace/utils/slideDeckOps";
import type { OfficeKind } from "./catalog";

/** Same payload formats as the Workspace canvas editors; no conversion or sync job. */
export function createOfficeBlock(kind: OfficeKind, title: string, now = Date.now()): CanvasBlock {
  const transform = createDualTransform({
    x: 100, y: 100, w: 800, h: 540, rotation: 0, zIndex: 0,
  });
  if (kind === "spreadsheet") {
    const table = createWorkspaceTableBlock(transform, "spreadsheet");
    return { ...table, officeTitle: title, createdAt: now, updatedAt: now };
  }
  if (kind === "presentation") {
    return {
      id: createBlockId(), type: "slideDeck", transform, officeTitle: title,
      data: normalizeSlideDeckData({ title, slideOrder: [], slides: {} }),
      createdAt: now, updatedAt: now,
    };
  }
  return {
    id: createBlockId(), type: "doc", transform, officeTitle: title,
    data: { html: "<p></p>" }, createdAt: now, updatedAt: now,
  };
}
