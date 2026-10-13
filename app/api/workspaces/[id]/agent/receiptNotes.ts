import { editorLayoutName } from "./mapLayoutRequest";

const FRAME_TYPES = new Set(["create_frame", "update_frame"]);

/** Guidance appended to the receipt so the model can correct itself in the same
 * turn: a presentation frame is only a saved camera view and draws no border. */
export function receiptNotes(
  applied: Array<{ type: string; ids?: string[]; notes?: string[] }>,
  blocks: Record<string, { style?: unknown; mapLayout?: unknown }> = {},
): string[] {
  const notes: string[] = applied.flatMap((item) => item.notes ?? []);
  const lockedWritten = applied.some((item) => (item.ids ?? []).some((id) => {
    const style = blocks[id]?.style as { locked?: unknown } | undefined;
    return Boolean(style?.locked);
  }));
  if (lockedWritten) {
    notes.push("Workspace has no block-lock feature: the locked flag was saved but protects nothing, and the block can still be moved, edited or deleted. Tell the user plainly that the block is NOT actually locked.");
  }
  const layoutNames = new Set<string>();
  for (const item of applied) {
    if (item.type !== "create_map" && item.type !== "update_map_style") continue;
    for (const id of item.ids ?? []) {
      const name = editorLayoutName(blocks[id]?.mapLayout as { family?: string } | undefined);
      if (name) layoutNames.add(name);
    }
  }
  if (layoutNames.size > 0) {
    const names = [...layoutNames].map((name) => `"${name}"`).join(", ");
    notes.push(`Map layout is now ${names}. In your reply, state the layout exactly as ${names} (the editor's name, with its One side/Both side and Right/Left/Down/Up setting). Do not call it a mindmap, org chart or catalog, even if the user did.`);
  }
  if (!applied.some((item) => FRAME_TYPES.has(item.type))) return notes;
  return [
    ...notes,
    "A presentation frame is only a saved camera view; nothing visible was drawn on the canvas. If the user asked for a box, border or container around blocks, also call wrap_blocks_in_frame (and tell the user the box will not move with the blocks later). Otherwise say it is a presentation frame.",
  ];
}
