/** Reject whole-block realtime writes for collection boards. */
export function hasCollectionBlock(blocks: unknown): boolean {
  if (!blocks || typeof blocks !== "object") return false;
  return Object.values(blocks as Record<string, unknown>).some((block) =>
    block !== null && typeof block === "object" && (block as Record<string, unknown>).type === "collection");
}
