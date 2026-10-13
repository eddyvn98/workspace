import type { BlockId, CanvasBlock } from "../types/block";
import { createComputedTransform } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { createConnectorId } from "../types/connector";
import { computeTreeLayout, type TreeLayoutSize } from "../layout/treeLayout";
import type { MarkdownImportResult, ParsedOutlineItem } from "./markdownImport";

const NEW_NODE_SIZE = { w: 170, h: 36 };

export function convertOutlineItemsToBlocks(roots: ParsedOutlineItem[]): MarkdownImportResult {
  const allBlocks: CanvasBlock[] = [];
  const allConnectors: CanvasConnector[] = [];
  let currentRootY = 0;

  for (const rootItem of roots) {
    const treeBlocks: CanvasBlock[] = [];
    const childrenByParent = new Map<BlockId, BlockId[]>();
    const sizes = new Map<BlockId, TreeLayoutSize>();

    function processItem(item: ParsedOutlineItem, parentId?: BlockId): BlockId {
      const id = item.id;
      const now = Date.now();
      const block: CanvasBlock<"text"> = {
        id,
        type: "text",
        transform: createComputedTransform({
          ...NEW_NODE_SIZE,
          x: 0,
          y: 0,
          rotation: 0,
          zIndex: 0,
        }),
        data: { markdown: item.text },
        parentId,
        createdAt: now,
        updatedAt: now,
      };
      treeBlocks.push(block);
      sizes.set(id, { w: NEW_NODE_SIZE.w, h: NEW_NODE_SIZE.h });

      if (parentId) {
        const siblings = childrenByParent.get(parentId) ?? [];
        siblings.push(id);
        childrenByParent.set(parentId, siblings);
        allConnectors.push({
          id: createConnectorId(),
          fromBlockId: parentId,
          toBlockId: id,
          lineType: "curved",
        });
      }

      for (const child of item.children) processItem(child, id);
      return id;
    }

    const rootId = processItem(rootItem);
    const positions = computeTreeLayout(
      rootId,
      0,
      currentRootY,
      "right",
      childrenByParent,
      sizes
    );

    let maxY = currentRootY;
    for (const block of treeBlocks) {
      const pos = positions.get(block.id);
      if (!pos) continue;
      block.transform = createComputedTransform({
        ...NEW_NODE_SIZE,
        x: pos.x,
        y: pos.y,
        rotation: 0,
        zIndex: 0,
      });
      maxY = Math.max(maxY, pos.y + NEW_NODE_SIZE.h);
    }

    allBlocks.push(...treeBlocks);
    currentRootY = maxY + 60;
  }

  return { blocks: allBlocks, connectors: allConnectors, skippedCount: 0 };
}
