"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockStyle } from "../types/block";

function cloneValue<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback if structuredClone fails
    }
  }
  return JSON.parse(JSON.stringify(data));
}

export interface UseFormatPainterResult {
  copyStyle: () => void;
  applyStyle: () => void;
  canApplyStyle: boolean;
}

/**
 * Hook providing format painter functionality to copy visual style from
 * one selected block and apply it to one or more selected blocks. Backed by
 * the shared store (not local state) so every consumer — the context menu,
 * the selection toolbar, and the "painting style…" indicator — agrees on
 * whether a copy is in progress, matching legacy's single global gesture.
 */
export function useFormatPainter(): UseFormatPainterResult {
  const canApplyStyle = useWorkspaceStore((state) => state.formatPainterStyle !== null);

  const copyStyle = useCallback(() => {
    const { selectedBlockIds, blocks, setFormatPainterStyle } = useWorkspaceStore.getState();
    if (selectedBlockIds.length !== 1) return;

    const selectedBlock = blocks[selectedBlockIds[0]];
    if (!selectedBlock) return;

    const copiedStyle: BlockStyle = selectedBlock.style
      ? cloneValue(selectedBlock.style)
      : {};

    setFormatPainterStyle(copiedStyle);
  }, []);

  const applyStyle = useCallback(() => {
    const { formatPainterStyle, selectedBlockIds, updateBlock } = useWorkspaceStore.getState();
    if (formatPainterStyle === null || selectedBlockIds.length === 0) return;

    selectedBlockIds.forEach((blockId) => {
      updateBlock(blockId, { style: { ...formatPainterStyle } });
    });
  }, []);

  return {
    copyStyle,
    applyStyle,
    canApplyStyle,
  };
}

export default useFormatPainter;
