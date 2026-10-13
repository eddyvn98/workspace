import { create } from "zustand";
import type { Position } from "../types/block";
import type { WorkspacePathCadCommand } from "../utils/pathCad";

interface WorkspacePathCadStore {
  command: WorkspacePathCadCommand | null;
  basePoint: Position | null;
  currentPoint: Position | null;
  initialMousePoint: Position | null;
  setCommand: (command: WorkspacePathCadCommand | null) => void;
  setBasePoint: (point: Position | null) => void;
  setCurrentPoint: (point: Position | null) => void;
  setInitialMousePoint: (point: Position | null) => void;
}

export const useWorkspacePathCadStore = create<WorkspacePathCadStore>((set) => ({
  command: null,
  basePoint: null,
  currentPoint: null,
  initialMousePoint: null,
  setCommand: (command) => set({ command }),
  setBasePoint: (basePoint) => set({ basePoint }),
  setCurrentPoint: (currentPoint) => set({ currentPoint }),
  setInitialMousePoint: (initialMousePoint) => set({ initialMousePoint }),
}));
