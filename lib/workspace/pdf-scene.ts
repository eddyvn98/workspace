import type { SlideScene, SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneShapePath, sceneShapeDash } from "@/app/workspace/utils/slideSceneShapePath";
import { xml } from "./pptx-elements";
import { sceneImageRenderRect } from "./slide-image-layout";
import { pdfSceneRichText } from "./pdf-scene-text";
import { pdfSceneTableSvg } from "./pdf-scene-table";
import { svgScenePaint } from "./svg-scene-paint";
import type { ExportImage } from "./slide-export-images";
type ImageLoader=(src:string)=>Promise<ExportImage>;
const attr=(value:string|undefined,fallback:string)=>xml(value||fallback);
const shapeColor=(value:string|undefined,fallback:string)=>attr(value,fallback);
function sceneChart(object:SlideSceneObject):string{
  const series=object.series??[];if(!series.length)return "";
  const maximum=Math.max(1,...series.map(item=>item.value)),inset=Math.min(25,object.w*0.05),labelHeight=Math.max(14,object.h*0.11);
  const areaWidth=object.w-inset*2,areaHeight=object.h-inset*2-labelHeight,width=areaWidth/series.length;
  return `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" fill="#ffffff"/>${series.map((item,i)=>{
    const barHeight=item.value/maximum*Math.max(1,areaHeight),x=object.x+inset+i*width+width*0.14,y=object.y+inset+areaHeight-barHeight;
    return `<rect x="${x}" y="${y}" width="${width*0.72}" height="${barHeight}" fill="${shapeColor(object.fill,"#4f46e5")}"/><text x="${x+width*0.36}" y="${object.y+object.h-inset/2}" font-family="Arial" font-size="${Math.max(11,Math.min(18,width*0.22))}" text-anchor="middle" fill="#111827">${xml(item.label)}</text>`;
  }).join("")}`;
}
async function sceneObjectSvg(object:SlideSceneObject,index:number,loadImage:ImageLoader):Promise<string>{
  const cx=object.x+object.w/2,cy=object.y+object.h/2,paint=svgScenePaint(object,index);
  let child="";
  if(object.kind==="text")child=pdfSceneRichText(object);
  if(object.kind==="shape")child=`<path transform="translate(${object.x} ${object.y})" d="${sceneShapePath(object)}" fill="${object.shapeKind==="line"?"none":paint.fill}" stroke="${shapeColor(object.stroke,"none")}" stroke-width="${object.strokeWidth??2}"${sceneShapeDash(object)?` stroke-dasharray="${sceneShapeDash(object)}"`:""} stroke-linejoin="round" stroke-linecap="round"/>`;
  if(object.kind==="chart")child=sceneChart(object);
  if(object.kind==="table")child=pdfSceneTableSvg(object,`scene-table-${index}`);
  if(object.kind==="image"&&object.src){
    const image=await loadImage(object.src),fit=sceneImageRenderRect({x:object.x,y:object.y,w:object.w,h:object.h},image,object.imageFit,object.imageFocusX,object.imageFocusY);
    child=`<image x="${fit.x}" y="${fit.y}" width="${fit.w}" height="${fit.h}" preserveAspectRatio="none" href="data:image/png;base64,${image.buffer.toString("base64")}"/>`;
  }
  const rotation=Number.isFinite(object.rotation)?object.rotation:0,opacity=object.opacity??1;
  return `${paint.defs}<g transform="rotate(${rotation} ${cx} ${cy})" opacity="${opacity}"><g${paint.filter}><g clip-path="url(#${paint.clipId})">${child}</g></g></g>`;
}
/** Static design export. Effects are applied after content clipping so shadows remain visible. */
export async function slideScenePdfSvg(scene:SlideScene,exportWidth:number,loadImage:ImageLoader):Promise<string>{
  const shapes=await Promise.all(scene.objects.map((object,index)=>sceneObjectSvg(object,index,loadImage)));
  return `<g transform="scale(${exportWidth/scene.width})">${shapes.join("")}</g>`;
}
