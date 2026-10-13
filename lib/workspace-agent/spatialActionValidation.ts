type Action = Record<string, unknown>;

export function validateSpatialAction(action: Action): string | null {
  if (action.type === "update_transform") {
    const transform = action.transform && typeof action.transform === "object" ? action.transform as Action : {};
    const changed = action.placement !== undefined || ["x", "y", "w", "width", "h", "height", "rotation", "zIndex"]
      .some((key) => action[key] !== undefined || transform[key] !== undefined);
    if (!changed) return "update_transform requires a placement or transform value.";
    if (action.placement !== undefined && !action.relativeToBlockId) return "update_transform placement requires relativeToBlockId.";
  }
  if (action.type === "arrange_selection") {
    const selected = Array.isArray(action.blockIds) ? action.blockIds : action.ids;
    if (!Array.isArray(selected) || selected.length < 2) return "arrange_selection requires at least two block IDs.";
  }
  if (action.type === "reorder_nodes" || action.type === "replace_children") {
    const nodes = action.nodes as unknown[];
    if (nodes.some((node) => {
      if (typeof node === "string") return !node.trim();
      if (!node || typeof node !== "object" || Array.isArray(node)) return true;
      const item = node as Action;
      return Object.keys(item).some((key) => key !== "id" && key !== "nodeId")
        || ![item.id, item.nodeId].some((value) => typeof value === "string" && value.trim());
    })) {
      return `${action.type}.nodes must contain block IDs.`;
    }
  }
  return null;
}
