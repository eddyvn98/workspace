import { create } from "zustand";

export const PATH_STROKE_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#000000",
  "#ffffff",
];

export const PATH_WIDTH_OPTIONS = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Thick", value: 8 },
  { label: "X-Thick", value: 16 },
] as const;

interface FreehandConfigState {
  strokeColor: string;
  strokeWidth: number;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
}

export const useFreehandConfig = create<FreehandConfigState>((set) => ({
  strokeColor: PATH_STROKE_SWATCHES[5],
  strokeWidth: 4,
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
}));
