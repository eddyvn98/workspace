import "./DocBlock";
import "./TextBlock";
import "./ImageBlock";
import "./LinkBlock";
import "./ShapeBlock";
import "./PathBlock";
import "./TableBlock";
import "./FileBlock";
import "./SlideDeckBlock";
import "./ImageFlowBlock.registration";

export { blockRendererRegistry, registerBlockRenderer } from "./registry";
export type { BlockRenderer, BlockRendererProps } from "./registry";
export { FallbackBlock } from "./FallbackBlock";
