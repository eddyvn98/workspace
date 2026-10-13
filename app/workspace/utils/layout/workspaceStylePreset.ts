import type { CanvasBlock, BlockId } from "../../types/block";
import { findMapRootId } from "../../layout/mapRoot";
import { findWorkspaceMapLayoutPalette } from "./mapLayoutPalettes";

function depthOf(blocks: Record<BlockId, CanvasBlock>, blockId: BlockId, rootId: BlockId): number {
  let depth = 0;
  let current = blocks[blockId];
  while (current && current.id !== rootId && current.parentId && depth < 1000) {
    depth += 1;
    current = blocks[current.parentId];
  }
  return depth;
}

/** Applies the selected map palette to each block level at render time. */
export function applyWorkspaceStylePreset(
  block: CanvasBlock,
  blocks: Record<BlockId, CanvasBlock>,
): CanvasBlock {
  const rootId = findMapRootId(blocks, block.id);
  if (!rootId) return block;
  const root = blocks[rootId];
  const preset = findWorkspaceMapLayoutPalette(root?.mapLayout?.stylePresetId ?? "default");
  if (!preset.rootBg || !preset.rootBorder || !preset.rootText) return block;

  const depth = depthOf(blocks, block.id, rootId);
  const color = preset.colors[(Math.max(depth, 1) - 1) % preset.colors.length];
  const style = block.style ?? {};
  // Older generated maps predate paletteManaged and contain the original
  // blue seed colors. Treat only those known seed values as palette-owned;
  // arbitrary colors remain user overrides.
  const isLegacySeed = depth === 0
    ? style.backgroundColor?.toLowerCase() === "#ffffff"
      && style.borderColor?.toLowerCase() === "#3370ff"
      && (!style.textColor || style.textColor.toLowerCase() === "#0f172a")
    : style.backgroundColor?.toLowerCase() === "#3370ff15"
      && style.borderColor?.toLowerCase() === "#3370ff";
  const managed = style.paletteManagedFields;
  const isManaged = (key: "backgroundColor" | "backgroundOpacity" | "borderColor" | "textColor") =>
    isLegacySeed || managed?.[key] === true;
  const userStyle = Object.fromEntries(Object.entries(style).filter(([key]) =>
    !["backgroundColor", "backgroundOpacity", "borderColor", "textColor", "paletteManagedFields"].includes(key)
      || !isManaged(key as "backgroundColor" | "backgroundOpacity" | "borderColor" | "textColor"),
  ));
  const presetStyle = depth === 0
    ? {
        backgroundColor: preset.rootBg,
        borderColor: preset.rootBorder,
        textColor: preset.rootText,
      }
    : {
        backgroundColor: color,
        backgroundOpacity: 0.15,
        borderColor: color,
        // See WorkspaceMapLayoutPalette.childText's own comment — a fixed
        // dark fallback here read fine on legacy's always-light canvas but
        // turns invisible once the tinted background sits over a dark one.
        textColor: preset.childText ?? "var(--workspace-node-child-text, #1e293b)",
      };

  // The palette is only a fallback. Explicit per-node styling must win so a
  // user can still pick a custom color after selecting a map palette.
  const nextStyle = { ...presetStyle, ...userStyle };
  // Called for every block on every render (WorkspacePage's block list map),
  // so returning a fresh object here even when nothing actually changed would
  // give BlockFrame a new `block` prop identity every time and defeat
  // React.memo for the whole canvas. Reuse the existing block/style
  // reference whenever the computed style is unchanged.
  if (shallowEqual(style as Record<string, unknown>, nextStyle as Record<string, unknown>)) return block;
  return { ...block, style: nextStyle };
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
