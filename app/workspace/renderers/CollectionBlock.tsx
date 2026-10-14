"use client";

import React, { useMemo } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { normalizeCollection, type CollectionSources } from "../collections/model";
import { CollectionSurface } from "./CollectionSurface";
import { useCollectionRevisionNotice } from "../hooks/useCollectionRevisionNotice";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";

export const CollectionBlock: React.FC<BlockRendererProps<"collection">> = ({ block, onChange, readOnly }) => {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const boardId = useWorkspaceStore((state) => state.boardId);
  const revisionNotice = useCollectionRevisionNotice(boardId);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const sources = useMemo<CollectionSources>(() => Object.fromEntries(Object.entries(blocks)
    .filter(([id, item]) => id !== block.id && item.type === "collection")
    .map(([id, item]) => [id, normalizeCollection(item.data as never)])), [blocks, block.id]);
  const data = normalizeCollection(block.data);
  return <div className="h-full w-full" onPointerDownCapture={() => {
    const state = useWorkspaceStore.getState();
    if (!state.selectedBlockIds.includes(block.id)) state.setSelection([block.id]);
  }}><CollectionSurface data={data} sources={sources} revisionNotice={revisionNotice} readOnly={Boolean(readOnly) || isReadOnly || Boolean(block.style?.isLocked)} onChange={(next) => onChange(next)} /></div>;
};

registerBlockRenderer("collection", CollectionBlock);
