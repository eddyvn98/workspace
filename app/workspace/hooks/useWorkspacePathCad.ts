"use client";

import { useCallback } from "react";
import type React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspacePathCadStore } from "../store/useWorkspacePathCadStore";
import { createBlockId, resolveTransform, type CanvasBlock, type Position } from "../types/block";
import { clientToCanvasScreen, screenToCanvas } from "../utils/geometry";
import { cadDelta, previewPathTransform, scalePathPoints, type WorkspacePathCadCommand } from "../utils/pathCad";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function useWorkspacePathCad() {
  const command = useWorkspacePathCadStore((state) => state.command);
  const base = useWorkspacePathCadStore((state) => state.basePoint);
  const current = useWorkspacePathCadStore((state) => state.currentPoint);
  const setCommand = useWorkspacePathCadStore((state) => state.setCommand);
  const setBase = useWorkspacePathCadStore((state) => state.setBasePoint);
  const setCurrent = useWorkspacePathCadStore((state) => state.setCurrentPoint);
  const setInitial = useWorkspacePathCadStore((state) => state.setInitialMousePoint);

  const clear = useCallback(() => {
    setCommand(null);
    setBase(null);
    setCurrent(null);
    setInitial(null);
  }, [setBase, setCommand, setCurrent, setInitial]);

  const arm = useCallback((next: WorkspacePathCadCommand) => {
    if (command === next) {
      clear();
      return;
    }
    setCommand(next);
    setBase(null);
    setCurrent(null);
    setInitial(null);
  }, [clear, command, setBase, setCommand, setCurrent, setInitial]);

  const commit = useCallback((target: Position) => {
    const state = useWorkspaceStore.getState();
    const id = state.selectedBlockIds.length === 1 ? state.selectedBlockIds[0] : null;
    const block = id ? state.blocks[id] : null;
    const cadState = useWorkspacePathCadStore.getState();
    const cadCommand = cadState.command;
    const cadBase = cadState.basePoint;
    if (!id || !block || block.type !== "path" || !cadCommand || !cadBase) {
      clear();
      return;
    }

    const pathBlock = block as CanvasBlock<"path">;
    const transform = resolveTransform(pathBlock.transform, DEFAULT_TRANSFORM);
    const initial = cadState.initialMousePoint;
    const nextTransform = previewPathTransform(transform, cadCommand, cadBase, target, initial);

    if (cadCommand === "copy" || cadCommand === "offset") {
      const delta = cadDelta(cadBase, target);
      const now = Date.now();
      const copy: CanvasBlock<"path"> = {
        ...clone(pathBlock),
        id: createBlockId(),
        transform: { computed: null, override: { ...nextTransform, x: transform.x + delta.x, y: transform.y + delta.y } },
        createdAt: now,
        updatedAt: now,
      };
      state.addBlock(copy);
      state.setSelection([copy.id]);
    } else if (cadCommand === "mirror") {
      const width = transform.w;
      state.updateBlock(id, { data: { ...pathBlock.data, points: pathBlock.data.points.map((point) => ({ x: width - point.x, y: point.y })) } });
    } else if (cadCommand === "transform") {
      state.updateBlock(id, {
        data: { ...pathBlock.data, points: scalePathPoints(pathBlock.data.points, transform, nextTransform) },
      });
      state.updateBlockTransform(id, nextTransform, "override");
    } else if (cadCommand === "rotate" || cadCommand === "move") {
      state.updateBlockTransform(id, nextTransform, "override");
    }
    clear();
  }, [clear]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!command || event.button !== 0) return false;
    const isBackground = event.target === event.currentTarget || event.target === event.currentTarget.firstElementChild;
    if (!isBackground) return false;
    event.preventDefault();
    const rect = typeof event.currentTarget.getBoundingClientRect === "function"
      ? event.currentTarget.getBoundingClientRect()
      : { left: 0, top: 0 };
    const point = screenToCanvas(clientToCanvasScreen({ x: event.clientX, y: event.clientY }, rect), useWorkspaceStore.getState().camera);
    if (!base) {
      setBase(point);
      setCurrent(point);
      setInitial(point);
    } else {
      commit(point);
    }
    return true;
  }, [base, commit, command, setBase, setCurrent, setInitial]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!command || !base) return false;
    event.preventDefault();
    const rect = typeof event.currentTarget.getBoundingClientRect === "function"
      ? event.currentTarget.getBoundingClientRect()
      : { left: 0, top: 0 };
    setCurrent(screenToCanvas(clientToCanvasScreen({ x: event.clientX, y: event.clientY }, rect), useWorkspaceStore.getState().camera));
    return true;
  }, [base, command, setCurrent]);

  return { command, base, current, arm, clear, handlePointerDown, handlePointerMove };
}

export default useWorkspacePathCad;
