import { computeTreeLayout, DESCRIPTION_PANEL_EXTRA_HEIGHT, type TreeLayoutSize } from "../layout/treeLayout";
import { createBlockId, createComputedTransform, resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { IMAGE_SIZE, TABLE_SIZE, TEXT_SIZE, type ActionNode } from "./workspaceChatActionTypes";

/** Turns an AI "create_map" node tree into positioned CanvasBlocks +
 *  structural connectors, extracted out of workspaceChatActions.ts purely to
 *  keep that file under the project's 300-line cap. */
export function createActionMapBlocks(
  roots: ActionNode[],
  baseX: number,
  baseY: number,
  zIndex: number,
): { blocks: CanvasBlock[]; connectors: CanvasConnector[]; rootIds: string[] } {
  const blocks: CanvasBlock[] = [];
  const connectors: CanvasConnector[] = [];
  const rootIds: string[] = [];
  const childrenByParent = new Map<string, string[]>();
  const sizes = new Map<string, TreeLayoutSize>();
  const makeBlock = (node: ActionNode, parentId: string | undefined): string => {
    const id = createBlockId();
    const size = node.table ? TABLE_SIZE : node.image ? IMAGE_SIZE : TEXT_SIZE;
    const now = Date.now();
    const common = {
      id,
      transform: createComputedTransform({ x: 0, y: 0, ...size, rotation: 0, zIndex }),
      parentId,
      ...(node.style ? { style: node.style } : {}),
      ...(node.description ? { description: node.description } : {}),
      ...(node.icon ? { icon: node.icon } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const block: CanvasBlock = node.table
      ? { ...common, type: "table", data: node.table }
      : node.image
        ? { ...common, type: "image", data: { url: node.image, alt: node.topic } }
        : { ...common, type: "text", data: { markdown: node.topic } };
    blocks.push(block);
    // Layout spacing uses a taller size than the block's own box when it has
    // a description, so siblings/rows below get pushed clear of the
    // description panel BlockDescription.tsx renders under this block.
    sizes.set(id, node.description ? { ...size, h: size.h + DESCRIPTION_PANEL_EXTRA_HEIGHT } : size);
    if (parentId) {
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), id]);
      connectors.push({ id: createConnectorId(), fromBlockId: parentId, toBlockId: id, lineType: "curved" });
    }
    node.children.forEach((child) => makeBlock(child, id));
    return id;
  };
  let rootY = baseY;
  for (const root of roots) {
    const rootId = makeBlock(root, undefined);
    rootIds.push(rootId);
    const positions = computeTreeLayout(rootId, baseX, rootY, "right", childrenByParent, sizes);
    let maxY = rootY;
    for (const block of blocks.filter((item) => positions.has(item.id))) {
      const position = positions.get(block.id);
      if (!position) continue;
      const transform = resolveTransform(block.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex });
      block.transform = createComputedTransform({ ...transform, x: position.x, y: position.y });
      // Use the layout (description-inclusive) height here, not just the
      // block's own box height, so a description on the last child doesn't
      // collide with the next root tree stacked below this one.
      const layoutHeight = sizes.get(block.id)?.h ?? transform.h;
      maxY = Math.max(maxY, position.y + layoutHeight);
    }
    rootY = maxY + 80;
  }
  return { blocks, connectors, rootIds };
}
