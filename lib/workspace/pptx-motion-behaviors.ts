import type { SceneCue } from "@/app/workspace/utils/slideSceneSchedule";
import type { SceneMotionPoint } from "@/app/workspace/types/slideSceneMotion";
import { xml } from "./pptx-elements";
export type MotionXmlContext = {nextId:()=>number;shapeId:number;width:number;height:number};
const attrs=(names:string[])=>names.length?`<p:attrNameLst>${names.map(name=>`<p:attrName>${name}</p:attrName>`).join("")}</p:attrNameLst>`:"";
export function visibilityBehavior(ctx:MotionXmlContext,visible:boolean,delay=0):string {
  return `<p:set><p:cBhvr><p:cTn id="${ctx.nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${ctx.shapeId}"/></p:tgtEl>${attrs(["style.visibility"])}</p:cBhvr><p:to><p:strVal val="${visible?"visible":"hidden"}"/></p:to></p:set>`;
}
function behavior(ctx:MotionXmlContext,duration:number,names:string[]=[],options:{fill?:string;additive?:string;autoRev?:boolean}={}):string {
  return `<p:cBhvr${options.additive?` additive="${options.additive}"`:""}><p:cTn id="${ctx.nextId()}" dur="${Math.max(1,Math.round(duration))}" fill="${options.fill??"hold"}"${options.autoRev?' autoRev="1"':""}/><p:tgtEl><p:spTgt spid="${ctx.shapeId}"/></p:tgtEl>${attrs(names)}</p:cBhvr>`;
}
const coord=(n:number)=>Number(n.toFixed(8)).toString();
export function nativeMotionPath(points:SceneMotionPoint[],width:number,height:number):string {
  return points.map((point,index)=>`${index?"L":"M"} ${coord(point.x/width)} ${coord(point.y/height)}`).join(" ")+" E";
}
function travel(ctx:MotionXmlContext,points:SceneMotionPoint[],duration:number,persist:boolean):string {
  return `<p:animMotion origin="layout" path="${xml(nativeMotionPath(points,ctx.width,ctx.height))}" pathEditMode="relative">${behavior(ctx,duration,["ppt_x","ppt_y"],{fill:persist?"hold":"remove",additive:"sum"})}</p:animMotion>`;
}
/** ECMA-376 p:animEffect/p:animMotion/p:animRot/p:animScale, not embedded code or video. */
export function nativeEffectBehaviors(cue:SceneCue,ctx:MotionXmlContext):string {
  if(cue.phase==="motion")return travel(ctx,cue.path??[{x:0,y:0},{x:160,y:0}],cue.durationMs,true);
  if(cue.kind==="spin")return `<p:animRot by="21600000">${behavior(ctx,cue.durationMs,["r"],{fill:"remove",additive:"sum"})}</p:animRot>`;
  if(cue.kind==="pulse")return `<p:animScale zoomContents="1">${behavior(ctx,cue.durationMs/2,["ppt_w","ppt_h"],{fill:"remove",autoRev:true})}<p:from x="100000" y="100000"/><p:to x="112000" y="112000"/></p:animScale>`;
  const entering=cue.phase==="entrance";
  const filter=cue.kind==="wipe"?"wipe(right)":"fade";
  let out=entering?visibilityBehavior(ctx,true):"";
  out+=`<p:animEffect transition="${entering?"in":"out"}" filter="${filter}">${behavior(ctx,cue.durationMs)}</p:animEffect>`;
  if(cue.kind==="rise"||cue.kind==="slide"){
    const offset=cue.kind==="rise"?{x:0,y:24}:{x:50,y:0};
    out+=travel(ctx,entering?[offset,{x:0,y:0}]:[{x:0,y:0},offset],cue.durationMs,false);
  }
  if(cue.kind==="zoom")out+=`<p:animScale zoomContents="1">${behavior(ctx,cue.durationMs,["ppt_w","ppt_h"],{fill:"remove"})}<p:from x="${entering?80000:100000}" y="${entering?80000:100000}"/><p:to x="${entering?100000:80000}" y="${entering?100000:80000}"/></p:animScale>`;
  if(!entering)out+=visibilityBehavior(ctx,false,cue.durationMs);
  return out;
}
