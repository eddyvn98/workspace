export interface WorkspaceMapLayoutPalette {
  id: string;
  name: string;
  colors: readonly string[];
  canvasBg?: string;
  rootBg?: string;
  rootBorder?: string;
  rootText?: string;
  /** Text color for every non-root node (depth > 0). Their background is a
   *  translucent tint of `colors` over the canvas (see
   *  applyWorkspaceStylePreset), so unlike `rootText` this can't default to a
   *  fixed dark color the way legacy did — a palette whose canvas is always
   *  dark (every preset below except "default") needs a fixed light value
   *  here, or its child nodes render dark-on-dark. Left unset only for
   *  "default", whose canvas follows the app's own light/dark theme (see
   *  WorkspacePage's `bg-slate-50 dark:bg-slate-950`) — its child text falls
   *  back to the `--workspace-node-child-text` CSS variable in globals.css,
   *  which flips with `.dark` the same way. */
  childText?: string;
}
const DEFAULT_COLORS = [
  "#3370ff", "#3370ff", "#3370ff", "#3370ff",
  "#3370ff", "#3370ff", "#3370ff", "#3370ff",
] as const;

export const WORKSPACE_MAP_LAYOUT_PALETTES: readonly WorkspaceMapLayoutPalette[] = [
  {
    id: "default",
    name: "Default",
    colors: DEFAULT_COLORS,
    rootBg: "#ffffff",
    rootBorder: "#3370ff",
    rootText: "#0f172a",
  },
  {
    id: "pastel",
    name: "Soft Pastel",
    colors: ["#fca5a5", "#fcd34d", "#86efac", "#93c5fd", "#c084fc", "#f472b6"],
    canvasBg: "#111317",
    rootBg: "#2d2f3e",
    rootBorder: "#c084fc",
    rootText: "#ffffff",
    childText: "#f4f4f5",
  },
  {
    id: "minimal",
    name: "Minimalist",
    colors: ["#d4d4d8", "#a1a1aa", "#71717a", "#e4e4e7", "#d4d4d8", "#a1a1aa"],
    canvasBg: "#09090b",
    rootBg: "#27272a",
    rootBorder: "#52525b",
    rootText: "#ffffff",
    childText: "#f4f4f5",
  },
  {
    id: "monochrome",
    name: "Monochrome Blue",
    colors: ["#60a5fa", "#3b82f6", "#1d4ed8", "#93c5fd", "#bfdbfe", "#2563eb"],
    canvasBg: "#0a1128",
    rootBg: "#172554",
    rootBorder: "#2563eb",
    rootText: "#ffffff",
    childText: "#f4f4f5",
  },
  {
    id: "vibrant",
    name: "Vibrant Neon",
    colors: ["#f43f5e", "#06b6d4", "#a855f7", "#10b981", "#f59e0b", "#3b82f6"],
    canvasBg: "#06030c",
    rootBg: "#3b0764",
    rootBorder: "#d946ef",
    rootText: "#ffffff",
    childText: "#f4f4f5",
  },
];

export function findWorkspaceMapLayoutPalette(id: string): WorkspaceMapLayoutPalette {
  return WORKSPACE_MAP_LAYOUT_PALETTES.find((palette) => palette.id === id)
    ?? WORKSPACE_MAP_LAYOUT_PALETTES[0];
}
