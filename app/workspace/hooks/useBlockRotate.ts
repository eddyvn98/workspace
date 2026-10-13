"use client";

import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import type { BlockId, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

export function useBlockRotate(blockId: BlockId) {
  const block = useWorkspaceStore((state) => state.blocks[blockId]);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);

  const cleanupRef = useRef<(() => void) | null>(null);

  const onRotateHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (block?.style?.isLocked) return;
      e.stopPropagation();

      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      const transform = block
        ? resolveTransform(block.transform, DEFAULT_TRANSFORM)
        : DEFAULT_TRANSFORM;

      const blockElement = e.currentTarget.closest<HTMLElement>("[data-block-id]");
      const rect = blockElement?.getBoundingClientRect();
      if (!rect) return;

      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const startAngle = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI;
      const initialRotation = transform.rotation;

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (useWorkspaceStore.getState().blocks[blockId]?.style?.isLocked) return;
        const currentAngle =
          (Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x) * 180) / Math.PI;
        const deltaAngle = currentAngle - startAngle;
        const newRotation = initialRotation + deltaAngle;

        updateBlockTransform(blockId, { rotation: newRotation }, "override");
      };

      const onPointerUp = () => {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [block, blockId, updateBlockTransform]
  );

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return {
    onRotateHandlePointerDown,
  };
}
