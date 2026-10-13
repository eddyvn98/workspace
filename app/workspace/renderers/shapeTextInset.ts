import type { ShapeKind } from "../types/block";

export interface ShapeTextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Workspace-local equivalent of the legacy shape text geometry table. */
export function getWorkspaceShapeTextBox(shape: ShapeKind, width: number, height: number): ShapeTextBox {
  const box = (x: number, y: number, w: number, h: number): ShapeTextBox => ({
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(0, Math.round(w)),
    height: Math.max(0, Math.round(h)),
  });
  switch (shape) {
    case "diamond": return box(width * 0.24, height * 0.24, width * 0.52, height * 0.52);
    case "triangle": return box(width * 0.275, height * 0.45, width * 0.45, height * 0.45);
    case "hexagon": return box(width * 0.225, height * 0.10, width * 0.55, height * 0.80);
    case "parallelogram":
    case "slant": return box(width * 0.15, 4, width * 0.70, height - 8);
    case "star": {
      const outerRadius = Math.min(width, height) / 2 - 2;
      const half = Math.max(Math.round(outerRadius * 0.42 * 0.57), 10);
      return box(width / 2 - half, height / 2 - half, half * 2, half * 2);
    }
    case "speech_bubble":
    case "callout": {
      const tailHeight = Math.min(10, height * 0.22);
      return box(8, 4, width - 16, height - tailHeight - 8);
    }
    case "cylinder": {
      const capHeight = Math.min(height * 0.28, 18);
      const top = Math.round(capHeight * 0.6);
      return box(6, top, width - 12, height - top - 4);
    }
    case "circle": {
      const radius = Math.min(width, height) / 2;
      if (width > height * 1.5) {
        const side = Math.round(radius);
        return box(side, 4, width - side * 2, height - 8);
      }
      const half = Math.round(radius * 0.67);
      return box(width / 2 - half, height / 2 - half, half * 2, half * 2);
    }
    case "oval": return box(width * 0.125, height * 0.125, width * 0.75, height * 0.75);
    case "pill": return box(18, 6, width - 36, height - 12);
    case "cloud":
    case "cloud_rect": return box(width * 0.12, height * 0.12, width * 0.76, height * 0.76);
    case "plain_text":
    case "underline": return box(6, 0, width - 12, height);
    default: return box(6, 6, width - 12, height - 12);
  }
}
