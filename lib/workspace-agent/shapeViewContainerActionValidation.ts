const TARGET_KEYS = ["blockId", "shapeId", "strokeId", "target", "id"] as const;
const TARGET_LIST_KEYS = ["targets", "targetIds", "blockIds", "ids"] as const;

function hasTarget(action: Record<string, unknown>): boolean {
  return TARGET_KEYS.some((key) => typeof action[key] === "string" && (action[key] as string).trim())
    || TARGET_LIST_KEYS.some((key) => Array.isArray(action[key]) && (action[key] as unknown[]).length > 0);
}

export function validateShapeViewContainerAction(action: Record<string, unknown>): string | null {
  const type = action.type;
  if (["update_shape", "delete_shape", "duplicate_shape", "update_freehand", "delete_freehand", "duplicate_freehand"].includes(String(type)) && !hasTarget(action)) {
    return `${String(type)} requires a blockId, target or id.`;
  }
  if (type === "update_shape" && !["shapeType", "shapeKind", "text", "label", "style", "x", "y", "width", "height", "rotation"].some((key) => key in action)) {
    return "update_shape requires at least one field to update.";
  }
  if (type === "update_freehand" && !["points", "color", "strokeColor", "strokeWidth", "width", "tool", "opacity"].some((key) => key in action)) {
    return "update_freehand requires at least one field to update.";
  }
  if (type === "focus_view") {
    const mode = action.mode;
    if (mode === "zoom" && action.zoom === undefined && action.factor === undefined) return "focus_view zoom requires zoom or factor.";
    if (mode === "pan" && action.dx === undefined && action.dy === undefined) return "focus_view pan requires dx or dy.";
    if (mode === "focus" && !hasTarget(action) && action.frameId === undefined && action.frameName === undefined) return "focus_view focus requires a block or frame target.";
    if (mode === "present") {
      const hasSlideTarget = [action.blockId, action.target].some((value) => typeof value === "string" && value.trim());
      const hasFrameTarget = [action.frameId, action.frameName].some((value) => typeof value === "string" && value.trim());
      if (!hasSlideTarget && !hasFrameTarget) return "focus_view present requires a slide-deck blockId, target, or frameId/frameName.";
    }
  }
  if (type === "wrap_blocks_in_frame" && action.scope === "selection" && !hasTarget(action)) return "wrap_blocks_in_frame selection scope requires block targets.";
  return null;
}
