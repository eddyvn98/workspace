import type { SlideScene, SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneShapePath, sceneShapeDash } from "@/app/workspace/utils/slideSceneShapePath";
import { sceneChartFromObject } from "@/app/workspace/types/slideSceneChart";
import { sceneChartSvgContent } from "@/app/workspace/utils/slideSceneChartSvg";
import { xml } from "./pptx-elements";
import { sceneImageRenderRect } from "./slide-image-layout";
import { pdfSceneRichText } from "./pdf-scene-text";
import { pdfSceneTableSvg } from "./pdf-scene-table";
import { svgScenePaint } from "./svg-scene-paint";
import type { ExportImage } from "./slide-export-images";
type ImageLoader=(src:string)=>Promise<ExportImage>;
async function sceneObjectSvg(object:SlideSceneObject,index:number,loadImage:ImageLoader):Promise<string>{
  const cx=object.x+object.w/2,cy=object.y+object.h/2,paint=svgScenePaint(object,index);
  let child="";
  if(object.kind==="text")child=pdfSceneRichText(object);
  if(object.kind==="shape")child=`<path transform="translate(${object.x} ${object.y})" d="${sceneShapePath(object)}" fill="${object.shapeKind==="line"?"none":paint.fill}" stroke="${xml(object.stroke??"none")}" stroke-width="${object.strokeWidth??2}"${sceneShapeDash(object)?` stroke-dasharray="${sceneShapeDash(object)}"`:""} stroke-linejoin="round" stroke-linecap="round"/>`;
  if(object.kind==="chart")child=`<g transform="translate(${object.x} ${object.y})">${sceneChartSvgContent(sceneChartFromObject(object),object.w,object.h,object.fontFamily??"Arial")}</g>`;
  if(object.kind==="table")child=pdfSceneTableSvg(object,`scene-table-${index}`);
  if(object.kind==="image"&&object.src){
    const image=await loadImage(object.src),fit=sceneImageRenderRect({x:object.x,y:object.y,w:object.w,h:object.h},image,object.imageFit,object.imageFocusX,object.imageFocusY);
    child=`<image x="${fit.x}" y="${fit.y}" width="${fit.w}" height="${fit.h}" preserveAspectRatio="none" href="data:image/png;base64,${image.buffer.toString("base64")}"/>`;
  }
  const rotation=Number.isFinite(object.rotation)?object.rotation:0,opacity=object.opacity??1;
  return `${paint.defs}<g transform="rotate(${rotation} ${cx} ${cy})" opacity="${opacity}"><g${paint.filter}><g clip-path="url(#${paint.clipId})">${child}</g></g></g>`;
}
/** Shared chart/vector/text geometry. PDF remains a static design export, not an animation player. */
export async function slideScenePdfSvg(scene:SlideScene,exportWidth:number,loadImage:ImageLoader):Promise<string>{
  const shapes=await Promise.all(scene.objects.map((object,index)=>sceneObjectSvg(object,index,loadImage)));
  return `<g transform="scale(${exportWidth/scene.width})">${shapes.join("")}</g>`;
}
