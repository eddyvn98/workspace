import type { Transform } from "../types/block";

export function getRotatedRectBounds(transform: Pick<Transform, "x" | "y" | "w" | "h" | "rotation">) {
  const angle = (transform.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfWidth = (transform.w * cos + transform.h * sin) / 2;
  const halfHeight = (transform.w * sin + transform.h * cos) / 2;
  const centerX = transform.x + transform.w / 2;
  const centerY = transform.y + transform.h / 2;
  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}
