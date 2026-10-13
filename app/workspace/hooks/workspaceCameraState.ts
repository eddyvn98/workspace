export function hasNonDefaultWorkspaceCamera(camera: unknown): boolean {
  if (!camera || typeof camera !== "object") return false;
  const value = camera as { x?: unknown; y?: unknown; zoom?: unknown };
  return value.x !== 0 || value.y !== 0 || value.zoom !== 1;
}
