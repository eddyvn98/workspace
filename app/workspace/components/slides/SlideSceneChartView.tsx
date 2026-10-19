"use client";
import React, { useMemo } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneChartFromObject } from "../../types/slideSceneChart";
import { sceneChartSvgContent } from "../../utils/slideSceneChartSvg";
export function SlideSceneChartView({object}:{object:SlideSceneObject}){
  const data=sceneChartFromObject(object);
  const markup=useMemo(()=>sceneChartSvgContent(data,object.w,object.h,object.fontFamily??"Arial"),[data,object.w,object.h,object.fontFamily]);
  // All markup is generated from normalized values by a fixed, escaping SVG serializer.
  return <svg className="h-full w-full" viewBox={`0 0 ${object.w} ${object.h}`} preserveAspectRatio="none" role="img" aria-label={data.title||`${data.type} chart`} dangerouslySetInnerHTML={{__html:markup}}/>;
}
