const TARGET_KEYS = ["frameId", "frameName", "id", "target"] as const;

export function validateFrameAction(action: Record<string, unknown>): string | null {
  const type = action.type;
  if (type === "create_frame") {
    const camera = action.camera && typeof action.camera === "object" ? action.camera as Record<string, unknown> : {};
    const hasCamera = [camera.x, camera.y, camera.zoom].every((value) => typeof value === "number" && Number.isFinite(value)) && Number(camera.zoom) > 0;
    const hasFitTarget = [action.blockIds, action.fitBlockIds, camera.blockIds, camera.fitBlockIds].some((value) => Array.isArray(value) && value.length > 0);
    return hasCamera || hasFitTarget ? null : "create_frame requires a finite camera with positive zoom or non-empty blockIds/fitBlockIds.";
  }
  if (type === "update_frame" || type === "delete_frame") {
    return TARGET_KEYS.some((key) => typeof action[key] === "string" && (action[key] as string).trim())
      ? null : `${type} requires a frameId, frameName, id or target.`;
  }
  if (type === "reorder_frames" && (!Array.isArray(action.frameIds) || action.frameIds.length < 1)) {
    return "reorder_frames requires the complete non-empty frameIds list.";
  }
  return null;
}
