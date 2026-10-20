"use client";
import React, { useId } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { exactSceneImagePlacement } from "../../types/slideSceneImageCrop";
import { sceneShapePath } from "../../utils/slideSceneShapePath";
export function SlideSceneImageView({ object: o }: { object: SlideSceneObject }) {
  const id = "image-mask-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  let image: React.ReactNode = <img alt="" src={o.src} draggable={false} className="h-full w-full" style={{ objectFit: o.imageFit ?? "cover", objectPosition: `${(o.imageFocusX ?? 0.5) * 100}% ${(o.imageFocusY ?? 0.5) * 100}%` }}/>;
  if (o.imageCrop !== undefined || o.imageViewport !== undefined) {
    const { image: placed, clip } = exactSceneImagePlacement({ x: 0, y: 0, w: 1, h: 1 }, o.imageCrop, o.imageViewport);
    image = <div data-image-exact-crop className="relative h-full w-full overflow-hidden">
      <div style={{ position: "absolute", overflow: "hidden", left: `${clip.x * 100}%`, top: `${clip.y * 100}%`, width: `${clip.w * 100}%`, height: `${clip.h * 100}%` }}>
        <img alt="" src={o.src} draggable={false} style={{ position: "absolute", maxWidth: "none", objectFit: "fill",
          left: `${(placed.x - clip.x) / clip.w * 100}%`, top: `${(placed.y - clip.y) / clip.h * 100}%`,
          width: `${placed.w / clip.w * 100}%`, height: `${placed.h / clip.h * 100}%` }}/>
      </div>
    </div>;
  }
  if (!o.imageMask || o.imageMask.shapeKind === "rect") return <>{image}</>;
  const mask = { ...o, ...o.imageMask, kind: "shape" as const };
  return <svg className="h-full w-full" viewBox={`0 0 ${o.w} ${o.h}`} preserveAspectRatio="none" aria-hidden>
    <defs><clipPath id={id} clipPathUnits="userSpaceOnUse"><path d={sceneShapePath(mask)}/></clipPath></defs>
    <g clipPath={`url(#${id})`}><foreignObject x={0} y={0} width={o.w} height={o.h}>{image}</foreignObject></g>
  </svg>;
}
