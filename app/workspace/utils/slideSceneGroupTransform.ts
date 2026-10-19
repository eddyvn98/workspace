import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";
import { scaleSceneRichText } from "../types/slideSceneText";
import { expandSceneSelection } from "./slideSceneGroups";
export type SceneBounds={x:number;y:number;w:number;h:number};
const round=(n:number)=>Math.round(n*100)/100;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
/** Selection frame currently uses unrotated object boxes; native object geometry remains independent. */
export function sceneSelectionBounds(scene:SlideScene,ids:string[]):SceneBounds|null{
  const selected=new Set(expandSceneSelection(scene,ids)),objects=scene.objects.filter(o=>selected.has(o.id));
  if(!objects.length)return null;
  const x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));
  const right=Math.max(...objects.map(o=>o.x+o.w)),bottom=Math.max(...objects.map(o=>o.y+o.h));
  return {x,y,w:right-x,h:bottom-y};
}
function changeScene(scene:SlideScene,selected:Set<string>,transform:(object:SlideSceneObject)=>SlideSceneObject):SlideScene{
  if(!selected.size||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  const objects=scene.objects.map(o=>selected.has(o.id)?transform(o):o);
  return normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9")??scene;
}
export function resizeSceneSelection(scene:SlideScene,ids:string[],target:SceneBounds):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),bounds=sceneSelectionBounds(scene,ids);
  if(!bounds||Object.values(target).some(v=>!Number.isFinite(v))||bounds.w<=0||bounds.h<=0||target.w<=0||target.h<=0)return scene;
  const sx=target.w/bounds.w,sy=target.h/bounds.h,textScale=Math.sqrt(sx*sy);
  return changeScene(scene,selected,o=>({
    ...o,x:round(target.x+(o.x-bounds.x)*sx),y:round(target.y+(o.y-bounds.y)*sy),w:clamp(round(o.w*sx),8,2560),h:clamp(round(o.h*sy),8,1920),
    ...(o.kind==="text"?{fontSize:clamp(round((o.fontSize??44)*textScale),8,180),...(o.richText?{richText:scaleSceneRichText(o.richText,textScale)}:{})}:{}),
    ...(o.kind==="shape"?{radius:clamp(round((o.radius??0)*Math.min(sx,sy)),0,200),strokeWidth:clamp(round((o.strokeWidth??2)*textScale),0,40)}:{}),
    ...(o.kind==="table"&&o.table?{fontSize:clamp(round((o.fontSize??22)*textScale),8,120),table:{...o.table,rows:o.table.rows.map(row=>row.map(cell=>cell.fontSize===undefined?cell:{...cell,fontSize:clamp(round(cell.fontSize*textScale),8,120)}))}}:{}),
  }));
}
export function rotateSceneSelection(scene:SlideScene,ids:string[],degrees:number):SlideScene{
  if(!Number.isFinite(degrees)||!degrees)return scene;
  const selected=new Set(expandSceneSelection(scene,ids)),bounds=sceneSelectionBounds(scene,ids);if(!bounds)return scene;
  const cx=bounds.x+bounds.w/2,cy=bounds.y+bounds.h/2,rad=degrees*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  return changeScene(scene,selected,o=>{
    const ox=o.x+o.w/2-cx,oy=o.y+o.h/2-cy,newCx=cx+ox*cos-oy*sin,newCy=cy+ox*sin+oy*cos;
    const angle=((o.rotation+degrees+180)%360+360)%360-180;
    return {...o,x:round(newCx-o.w/2),y:round(newCy-o.h/2),rotation:round(angle)};
  });
}
