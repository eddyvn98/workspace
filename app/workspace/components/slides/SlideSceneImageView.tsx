"use client";
import React, { useId } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneShapePath } from "../../utils/slideSceneShapePath";
export function SlideSceneImageView({ object: o }: { object: SlideSceneObject }) {
  const id = "image-mask-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const image = <img alt="" src={o.src} draggable={false} className="h-full w-full" style={{ objectFit: o.imageFit ?? "cover", objectPosition: `${(o.imageFocusX ?? 0.5) * 100}% ${(o.imageFocusY ?? 0.5) * 100}%` }}/>;
  if (!o.imageMask || o.imageMask.shapeKind === "rect") return image;
  const mask = { ...o, ...o.imageMask, kind: "shape" as const };
  return <svg className="h-full w-full" viewBox={`0 0 ${o.w} ${o.h}`} preserveAspectRatio="none" aria-hidden>
    <defs><clipPath id={id} clipPathUnits="userSpaceOnUse"><path d={sceneShapePath(mask)}/></clipPath></defs>
    <g clipPath={`url(#${id})`}><foreignObject x={0} y={0} width={o.w} height={o.h}>{image}</foreignObject></g>
  </svg>;
}
