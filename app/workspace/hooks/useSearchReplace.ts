"use client";

import { useState, useMemo, useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId, CanvasBlock } from "../types/block";

export type SearchMatchField = "markdown" | "title" | "alt" | "url";

export interface SearchMatch {
  blockId: BlockId;
  field: SearchMatchField;
  matchText: string;
}

export interface UseSearchReplaceReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  replacement: string;
  setReplacement: React.Dispatch<React.SetStateAction<string>>;
  matches: SearchMatch[];
  matchIndex: number;
  next: () => void;
  prev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
  selectCurrentBlock: () => void;
}

/**
 * Replaces the first case-insensitive match of `search` with `replacement` in `source`,
 * using pure string operations (avoiding RegExp creation to prevent regex injection).
 */
function replaceFirstCaseInsensitive(
  source: string,
  search: string,
  replacement: string
): string {
  if (!search) return source;
  const lowerSource = source.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const index = lowerSource.indexOf(lowerSearch);
  if (index === -1) return source;
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

/**
 * Replaces all case-insensitive matches of `search` with `replacement` in `source`,
 * using pure string operations.
 */
function replaceAllCaseInsensitive(
  source: string,
  search: string,
  replacement: string
): string {
  if (!search) return source;
  const lowerSearch = search.toLowerCase();
  let result = "";
  let startIndex = 0;
  while (true) {
    const lowerSource = source.toLowerCase();
    const matchIndex = lowerSource.indexOf(lowerSearch, startIndex);
    if (matchIndex === -1) {
      result += source.slice(startIndex);
      break;
    }
    result += source.slice(startIndex, matchIndex) + replacement;
    startIndex = matchIndex + search.length;
  }
  return result;
}

/**
 * Custom hook for searching and replacing text content across workspace blocks.
 */
export function useSearchReplace(): UseSearchReplaceReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const blocks = useWorkspaceStore((state) => state.blocks);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);

  const matches = useMemo<SearchMatch[]>(() => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    const result: SearchMatch[] = [];

    const seen = new Set<BlockId>();
    const orderedBlocks: CanvasBlock[] = [];
    for (const id of blockOrder) {
      const block = blocks[id];
      if (block) {
        orderedBlocks.push(block);
        seen.add(id);
      }
    }
    for (const id of Object.keys(blocks)) {
      if (!seen.has(id)) {
        const block = blocks[id];
        if (block) {
          orderedBlocks.push(block);
        }
      }
    }

    for (const block of orderedBlocks) {
      if (block.type === "text") {
        const textData = block.data as { markdown?: string };
        const markdown = textData?.markdown ?? "";
        if (markdown && markdown.toLowerCase().includes(lowerQuery)) {
          result.push({
            blockId: block.id,
            field: "markdown",
            matchText: markdown,
          });
        }
      } else if (block.type === "link") {
        const linkData = block.data as { title?: string; url?: string };
        const title = linkData?.title ?? "";
        if (title && title.toLowerCase().includes(lowerQuery)) {
          result.push({
            blockId: block.id,
            field: "title",
            matchText: title,
          });
        }
        const url = linkData?.url ?? "";
        if (url && url.toLowerCase().includes(lowerQuery)) {
          result.push({
            blockId: block.id,
            field: "url",
            matchText: url,
          });
        }
      } else if (block.type === "image") {
        const imageData = block.data as { alt?: string };
        const alt = imageData?.alt ?? "";
        if (alt && alt.toLowerCase().includes(lowerQuery)) {
          result.push({
            blockId: block.id,
            field: "alt",
            matchText: alt,
          });
        }
      }
    }

    return result;
  }, [blocks, blockOrder, query]);

  const activeIndex =
    matches.length > 0
      ? Math.min(Math.max(0, matchIndex), matches.length - 1)
      : 0;

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setReplacement("");
    setMatchIndex(0);
  }, []);

  const next = useCallback(() => {
    if (matches.length === 0) return;
    const nextIndex = (activeIndex + 1) % matches.length;
    setMatchIndex(nextIndex);
    useWorkspaceStore.getState().setSelection([matches[nextIndex].blockId]);
  }, [matches, activeIndex]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIndex = (activeIndex - 1 + matches.length) % matches.length;
    setMatchIndex(prevIndex);
    useWorkspaceStore.getState().setSelection([matches[prevIndex].blockId]);
  }, [matches, activeIndex]);

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0 || !query) return;
    const currentMatch = matches[activeIndex];
    if (!currentMatch || currentMatch.field === "url") return;

    const currentBlocks = useWorkspaceStore.getState().blocks;
    const block = currentBlocks[currentMatch.blockId];
    if (!block) return;

    const currentData = (block.data as Record<string, unknown>) ?? {};
    const currentVal = currentData[currentMatch.field];
    if (typeof currentVal !== "string") return;

    const newVal = replaceFirstCaseInsensitive(currentVal, query, replacement);
    useWorkspaceStore.getState().updateBlock(currentMatch.blockId, {
      data: {
        ...currentData,
        [currentMatch.field]: newVal,
      } as CanvasBlock["data"],
    });
  }, [matches, activeIndex, query, replacement]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0 || !query) return;

    const currentBlocks = useWorkspaceStore.getState().blocks;
    const patchesByBlock: Record<string, Record<string, unknown>> = {};

    for (const match of matches) {
      if (match.field === "url") continue;
      const block = currentBlocks[match.blockId];
      if (!block) continue;

      const currentData = (block.data as Record<string, unknown>) ?? {};
      const currentVal = currentData[match.field];
      if (typeof currentVal !== "string") continue;

      if (!patchesByBlock[match.blockId]) {
        patchesByBlock[match.blockId] = { ...currentData };
      }

      const existingVal = patchesByBlock[match.blockId][match.field];
      const sourceStr = typeof existingVal === "string" ? existingVal : currentVal;

      patchesByBlock[match.blockId][match.field] = replaceAllCaseInsensitive(
        sourceStr,
        query,
        replacement
      );
    }

    for (const [blockId, updatedData] of Object.entries(patchesByBlock)) {
      useWorkspaceStore.getState().updateBlock(blockId, {
        data: updatedData as CanvasBlock["data"],
      });
    }
  }, [matches, query, replacement]);

  const selectCurrentBlock = useCallback(() => {
    if (matches.length === 0) return;
    const currentMatch = matches[activeIndex];
    if (currentMatch) {
      useWorkspaceStore.getState().setSelection([currentMatch.blockId]);
    }
  }, [matches, activeIndex]);

  return {
    isOpen,
    open,
    close,
    query,
    setQuery,
    replacement,
    setReplacement,
    matches,
    matchIndex: activeIndex,
    next,
    prev,
    replaceCurrent,
    replaceAll,
    selectCurrentBlock,
  };
}

export default useSearchReplace;
