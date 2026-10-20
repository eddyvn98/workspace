import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";
import { scaleSceneRichText } from "../types/slideSceneText";
import { expandSceneSelection } from "./slideSceneGroups";
import { sceneNeedsUniformScale, unionSceneBounds, type SceneBounds } from "./slideSceneBounds";
export type { SceneBounds } from "./slideSceneBounds";
const round=(n:number)=>Math.round(n*10000)/10000;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function sceneSelectionBounds(scene:SlideScene,ids:string[]):SceneBounds|null{
  const selected=new Set(expandSceneSelection(scene,ids));return unionSceneBounds(scene.objects.filter(o=>selected.has(o.id)));
}
function changeScene(scene:SlideScene,selected:Set<string>,transform:(object:SlideSceneObject)=>SlideSceneObject):SlideScene{
  if(!selected.size||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  const objects=scene.objects.map(o=>selected.has(o.id)?transform(o):o);
  return normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9")??scene;
}
/** Nonuniform scaling of arbitrary rotations would require shear; the UI constrains these to uniform scale. */
export function resizeSceneSelection(scene:SlideScene,ids:string[],target:SceneBounds):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),members=scene.objects.filter(o=>selected.has(o.id)),bounds=unionSceneBounds(members);
  if(!bounds||Object.values(target).some(v=>!Number.isFinite(v))||bounds.w<=0||bounds.h<=0||target.w<=0||target.h<=0)return scene;
  const sx=target.w/bounds.w,sy=target.h/bounds.h,textScale=Math.sqrt(sx*sy);
  if(sceneNeedsUniformScale(members)&&Math.abs(sx-sy)>1e-6*Math.max(sx,sy))return scene;
  return changeScene(scene,selected,o=>{
    const angle=o.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),localX=Math.hypot(sx*cos,sy*sin),localY=Math.hypot(sx*sin,sy*cos);
    const w=clamp(round(o.w*localX),8,2560),h=clamp(round(o.h*localY),8,1920);
    const cx=target.x+(o.x+o.w/2-bounds.x)*sx,cy=target.y+(o.y+o.h/2-bounds.y)*sy;
    const rotation=Math.atan2(sy*sin,sx*cos)*180/Math.PI;
    return {...o,x:round(cx-w/2),y:round(cy-h/2),w,h,rotation:round(rotation),
      ...(o.kind==="text"?{fontSize:clamp(round((o.fontSize??44)*textScale),8,180),...(o.richText?{richText:scaleSceneRichText(o.richText,textScale)}:{})}:{}),
      ...(o.kind==="shape"?{radius:clamp(round((o.radius??0)*Math.min(localX,localY)),0,200),strokeWidth:clamp(round((o.strokeWidth??2)*textScale),0,40)}:{}),
      ...(o.shadow?{shadow:{...o.shadow,x:clamp(o.shadow.x*localX,-256,256),y:clamp(o.shadow.y*localY,-256,256),blur:clamp(o.shadow.blur*textScale,0,64)}}:{}),
      ...(o.imageMask?{imageMask:{...o.imageMask,radius:clamp((o.imageMask.radius??0)*Math.min(localX,localY),0,200)}}:{}),
      ...(o.kind==="table"&&o.table?{fontSize:clamp(round((o.fontSize??22)*textScale),8,120),table:{...o.table,rows:o.table.rows.map(row=>row.map(cell=>({...cell,
        ...(cell.fontSize!==undefined?{fontSize:clamp(round(cell.fontSize*textScale),8,120)}:{}),...(cell.richText?{richText:scaleSceneRichText(cell.richText,textScale)}:{})
      })))}}:{}),
    };
  });
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
