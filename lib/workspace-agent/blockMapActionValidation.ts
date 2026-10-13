export function validateBlockMapAction(action: Record<string, unknown>): string | null {
  if (action.type === "create_block") {
    const block = action.block && typeof action.block === "object" ? action.block as Record<string, unknown> : {};
    if (typeof action.blockType !== "string" && typeof block.type !== "string") return "create_block requires blockType or block.type.";
  }
  if ((action.type === "duplicate_map" || action.type === "copy_branch_to_map")
    && !["blockId", "target", "nodeId", "shapeId"].some((key) => typeof action[key] === "string" && (action[key] as string).trim())) {
    return `${String(action.type)} requires a blockId, target or nodeId.`;
  }
  return null;
}
