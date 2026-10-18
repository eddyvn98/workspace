"use client";

import React, { useEffect, useMemo } from "react";
import Link from "next/link";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { normalizeCollection, type CollectionSources } from "../collections/model";
import { resolveTransform } from "../types/block";
import { CollectionSurface } from "./CollectionSurface";
import { useCollectionRevisionNotice } from "../hooks/useCollectionRevisionNotice";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";

export const CollectionBlock: React.FC<BlockRendererProps<"collection">> = ({ block, onChange, readOnly }) => {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const boardId = useWorkspaceStore((state) => state.boardId);
  const revisionNotice = useCollectionRevisionNotice(boardId);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const sources = useMemo<CollectionSources>(() => Object.fromEntries(Object.entries(blocks)
    .filter(([id, item]) => id !== block.id && item.type === "collection")
    .map(([id, item]) => [id, normalizeCollection(item.data as never)])), [blocks, block.id]);
  const data = normalizeCollection(block.data);
  useEffect(() => {
    if (readOnly || isReadOnly) return;
    const transform = resolveTransform(block.transform, { x: 0, y: 0, w: 380, h: 220, rotation: 0, zIndex: 0 });
    if (transform.w === 900 && transform.h === 540) {
      updateBlockTransform(block.id, { w: 380, h: 220 }, block.transform.override ? "override" : "computed");
    }
  }, [block.id, block.transform, isReadOnly, readOnly, updateBlockTransform]);
  return <div className="relative h-full w-full" onPointerDownCapture={() => {
    const state = useWorkspaceStore.getState();
    if (!state.selectedBlockIds.includes(block.id)) state.setSelection([block.id]);
  }}><Link href={"/collections/" + encodeURIComponent(boardId) + "/" + encodeURIComponent(block.id)} className="absolute bottom-2 right-2 z-10 rounded bg-blue-600 px-2 py-1 text-xs text-white shadow hover:bg-blue-700" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>Open as app ↗</Link><CollectionSurface blockId={block.id} data={data} sources={sources} revisionNotice={revisionNotice} readOnly={Boolean(readOnly) || isReadOnly || Boolean(block.style?.isLocked)} onChange={(next) => onChange(next)} /></div>;
};

registerBlockRenderer("collection", CollectionBlock);
