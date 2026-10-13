"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { normalizeCollection } from "../collections/model";
import { CollectionSurface } from "./CollectionSurface";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";

export const CollectionBlock: React.FC<BlockRendererProps<"collection">> = ({ block, onChange, readOnly }) => {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const data = normalizeCollection(block.data);
  return <div className="h-full w-full" onPointerDownCapture={() => {
    const state = useWorkspaceStore.getState();
    if (!state.selectedBlockIds.includes(block.id)) state.setSelection([block.id]);
  }}><CollectionSurface data={data} readOnly={Boolean(readOnly) || isReadOnly || Boolean(block.style?.isLocked)} onChange={(next) => onChange(next)} /></div>;
};

registerBlockRenderer("collection", CollectionBlock);
