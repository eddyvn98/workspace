"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { normalizeCollection } from "../collections/model";
import { CollectionSurface } from "./CollectionSurface";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";

export const CollectionBlock: React.FC<BlockRendererProps<"collection">> = ({ block, onChange }) => {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const data = normalizeCollection(block.data);
  return <CollectionSurface data={data} readOnly={isReadOnly || Boolean(block.style?.isLocked)} onChange={(next) => onChange(next)} />;
};

registerBlockRenderer("collection", CollectionBlock);
