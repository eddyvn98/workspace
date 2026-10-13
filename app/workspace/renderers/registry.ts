import type { ComponentType } from "react";
import type { BlockDataMap, BlockType, CanvasBlock } from "../types/block";

export interface BlockRendererProps<T extends BlockType = BlockType> {
  block: CanvasBlock<T>;
  isSelected: boolean;
  onChange: (patch: Partial<BlockDataMap[T]>) => void;
}

export type BlockRenderer<T extends BlockType = BlockType> = ComponentType<BlockRendererProps<T>>;

export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer>> = {};

export function registerBlockRenderer<T extends BlockType>(type: T, renderer: BlockRenderer<T>): void {
  blockRendererRegistry[type] = renderer as unknown as BlockRenderer;
}
