import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneGradientLine } from "@/app/workspace/types/slideScenePaint";
import { sceneShapePath } from "@/app/workspace/utils/slideSceneShapePath";
import { xml } from "./pptx-elements";
export function svgScenePaint(object: SlideSceneObject, index: number) {
  const gradientId=`scene-gradient-${index}`,shadowId=`scene-shadow-${index}`,clipId=`scene-clip-${index}`;
  let definitions="";
  if (object.gradient) {
    const g=object.gradient,p=sceneGradientLine(object.w,object.h,g.angle);
    definitions+=`<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">${g.stops.map(s=>`<stop offset="${s.offset}" stop-color="${xml(s.color)}" stop-opacity="${s.opacity}"/>`).join("")}</linearGradient>`;
  }
  if (object.shadow) {
    const s=object.shadow,padX=Math.abs(s.x)+s.blur*3+2,padY=Math.abs(s.y)+s.blur*3+2;
    definitions+=`<filter id="${shadowId}" filterUnits="userSpaceOnUse" x="${object.x-padX}" y="${object.y-padY}" width="${object.w+padX*2}" height="${object.h+padY*2}" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${s.blur/2}" result="blur"/><feOffset in="blur" dx="${s.x}" dy="${s.y}" result="offset"/><feFlood flood-color="${xml(s.color)}" flood-opacity="${s.opacity}" result="color"/><feComposite in="color" in2="offset" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  }
  const mask=object.kind==="image"&&object.imageMask ? `<path transform="translate(${object.x} ${object.y})" d="${sceneShapePath({...object,...object.imageMask,kind:"shape"})}"/>`
    : `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}"/>`;
  definitions+=`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${mask}</clipPath>`;
  return {defs:`<defs>${definitions}</defs>`,fill:object.gradient?`url(#${gradientId})`:xml(object.fill??"#4f46e5"),clipId,filter:object.shadow?` filter="url(#${shadowId})"`:""};
}
