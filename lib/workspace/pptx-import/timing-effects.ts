import type { SceneMotion, SceneMotionPoint } from "@/app/workspace/types/slideSceneMotion";
import { child, children, descendants, first, numeric, NS } from "./xml";
import type { NoticeSink } from "./model";
export type ImportedEffect = { motion:SceneMotion; targetIds:string[]; durationMs:number };
const time=(node:Element|undefined)=>{const value=node?.getAttribute("dur");return value&&/^\d+$/.test(value)?Number(value):0;};
/** Linear/closed polylines only. Curve and command payloads are rejected rather than evaluated. */
export function readMotionPath(raw:string,width:number,height:number):SceneMotionPoint[]|undefined {
  if(raw.length>6000)return;
  const tokens=raw.match(/[MLZEmlze]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];
  if(tokens.join("").toLowerCase()!==raw.replace(/[\s,]/g,"").toLowerCase())return;
  const points:SceneMotionPoint[]=[];let index=0,x=0,y=0,ended=false;
  while(index<tokens.length){
    const command=tokens[index++];
    if(command.toUpperCase()==="E"){ended=true;break;}
    if(command.toUpperCase()==="Z"){if(!points.length)return;points.push({...points[0]});continue;}
    if(!["M","L","m","l"].includes(command)||index+1>=tokens.length)return;
    const px=Number(tokens[index++]),py=Number(tokens[index++]);if(!Number.isFinite(px)||!Number.isFinite(py))return;
    if(command===command.toLowerCase()){x+=px*width;y+=py*height;}else{x=px*width;y=py*height;}
    if(Math.abs(x)>1280||Math.abs(y)>960||points.length>=24)return;
    points.push({x,y});
  }
  if(!ended||index!==tokens.length||points.length<2||Math.abs(points[0].x)>0.01||Math.abs(points[0].y)>0.01)return;
  points[0]={x:0,y:0};return points;
}
export function readNativeEffect(node:Element,width:number,height:number,notice:NoticeSink):ImportedEffect|undefined {
  const targetNodes=descendants(node,NS.p,"spTgt"),targetIds=[...new Set(targetNodes.map(n=>n.getAttribute("spid")||""))].filter(Boolean);
  if(!targetIds.length)return;
  if(targetNodes.some(n=>n.hasChildNodes()))notice("animation-target","Paragraph/subshape animation was applied to the imported whole object.");
  const category=node.getAttribute("presetClass");
  const fade=first(node,NS.p,"animEffect"),move=first(node,NS.p,"animMotion"),spin=first(node,NS.p,"animRot"),scale=first(node,NS.p,"animScale");
  const behavior=fade||move||spin||scale;
  if(!behavior){notice("animation-effect","An unsupported effect or media command was not imported.");return;}
  const timeNode=first(behavior,NS.p,"cTn");
  let durationMs=time(node)||time(timeNode)*(timeNode?.getAttribute("autoRev")==="1"?2:1)||450;
  if(durationMs<100||durationMs>5000)notice("animation-duration","An effect duration was fitted to the supported 100-5000 ms range.");
  durationMs=Math.min(5000,Math.max(100,durationMs));
  let motion:SceneMotion={kind:"fade",phase:category==="exit"?"exit":"entrance",trigger:"with-previous",durationMs,delayMs:0};
  if(category==="path"||(!fade&&move)){
    const origin=move?.getAttribute("origin");
    const path=move&&(!origin||origin==="layout")?readMotionPath(move.getAttribute("path")||"",width,height):undefined;
    if(!path){notice("animation-path","A curved, transformed or unsupported motion path was not imported.");return;}
    motion={...motion,phase:"motion",kind:"move",path};
  }else if(category==="emph"||(!fade&&(spin||scale))){
    if(spin){
      if(Math.abs(numeric(spin,"by",21600000))!==21600000){notice("animation-spin","A non-full-turn spin was not imported.");return;}
      motion={...motion,phase:"emphasis",kind:"spin"};
    }else if(scale){
      if(first(scale,NS.p,"cTn")?.getAttribute("autoRev")!=="1"){notice("animation-scale","A permanent scale emphasis was not imported.");return;}
      const to=child(scale,NS.p,"to");
      if(numeric(to,"x",112000)!==112000||numeric(to,"y",112000)!==112000)notice("animation-scale","Pulse amplitude was normalized to 112%.");
      motion={...motion,phase:"emphasis",kind:"pulse"};
    }else{notice("animation-emphasis","An unsupported emphasis effect was not imported.");return;}
  }else{
    const filter=fade?.getAttribute("filter")||"fade";
    if(filter.startsWith("wipe")){
      motion.kind="wipe";if(filter!=="wipe(right)")notice("animation-direction","Wipe direction was normalized to the supported rightward reveal.");
    }else if(filter!=="fade"){notice("animation-filter",`Animation filter ${filter.slice(0,60)} was not imported.`);return;}
    if(fade?.getAttribute("transition")==="out")motion.phase="exit";
    if(scale)motion.kind="zoom";
    if(move){
      const values=(move.getAttribute("path")||"").match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)?.map(Number)??[];
      const x=values.filter((_,i)=>i%2===0).reduce((m,v)=>Math.max(m,Math.abs(v)),0)*width;
      const y=values.filter((_,i)=>i%2===1).reduce((m,v)=>Math.max(m,Math.abs(v)),0)*height;
      motion.kind=y>x?"rise":"slide";
      if(Math.abs((y>x?y:x)-(y>x?24:50))>0.5)notice("animation-distance","Fly distance was normalized to the Workspace entrance/exit preset.");
    }
  }
  const acceleration=numeric(node,"accel"),deceleration=numeric(node,"decel");
  motion.easing=acceleration&&deceleration?"ease-in-out":acceleration?"ease-in":deceleration?"ease-out":"linear";
  if(children(child(node,NS.p,"stCondLst"),NS.p,"cond").some(c=>first(c,NS.p,"tn")))notice("animation-condition","A time-node dependency needs visual review after conversion.");
  return {motion,targetIds,durationMs};
}
