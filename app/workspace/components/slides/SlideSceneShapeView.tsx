"use client";
import React, { useId } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneGradientLine } from "../../types/slideScenePaint";
import { sceneShapePath, sceneShapeDash } from "../../utils/slideSceneShapePath";
export function SlideSceneShapeView({ object }: { object: SlideSceneObject }) {
  const id="shape-gradient-"+useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const gradient=object.gradient,line=gradient?sceneGradientLine(object.w,object.h,gradient.angle):undefined;
  return <svg className="h-full w-full" viewBox={`0 0 ${object.w} ${object.h}`} preserveAspectRatio="none" aria-hidden>
    {gradient&&line&&<defs><linearGradient id={id} gradientUnits="userSpaceOnUse" {...line}>
      {gradient.stops.map((stop,index)=><stop key={index} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity}/>)}</linearGradient></defs>}
    <path d={sceneShapePath(object)} fill={object.shapeKind === "line" ? "none" : gradient?`url(#${id})`:object.fill ?? "#4f46e5"}
      stroke={object.stroke ?? "none"} strokeWidth={object.strokeWidth ?? 2} strokeDasharray={sceneShapeDash(object)} strokeLinejoin="round" strokeLinecap="round"/>
  </svg>;
}
