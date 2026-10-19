"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneShapePath, sceneShapeDash } from "../../utils/slideSceneShapePath";
export function SlideSceneShapeView({ object }: { object: SlideSceneObject }) {
  return <svg className="h-full w-full" viewBox={`0 0 ${object.w} ${object.h}`} preserveAspectRatio="none" aria-hidden>
    <path d={sceneShapePath(object)} fill={object.shapeKind === "line" ? "none" : object.fill ?? "#4f46e5"}
      stroke={object.stroke ?? "none"} strokeWidth={object.strokeWidth ?? 2} strokeDasharray={sceneShapeDash(object)} strokeLinejoin="round" strokeLinecap="round"/>
  </svg>;
}
