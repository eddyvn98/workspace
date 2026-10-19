import type { SceneMotion, SceneMotionPoint } from "@/app/workspace/types/slideSceneMotion";
import { child, children, descendants, first, numeric, NS } from "./xml";
import type { NoticeSink } from "./model";
export type ImportedEffect={motion:SceneMotion;targetIds:string[];durationMs:number};
const time=(node:Element|undefined)=>{const value=node?.getAttribute("dur");return value&&/^\d+$/.test(value)?Number(value):0;};
/** Accept one bounded polyline, never evaluate path text or silently turn curves into straight paths. */
export function readMotionPath(raw:string,width:number,height:number):SceneMotionPoint[]|undefined{
  if(raw.length>6000||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const tokens=raw.match(/[MLZEmlze]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];
  if(tokens.join("").toLowerCase()!==raw.replace(/[\s,]/g,"").toLowerCase())return;
  const points:SceneMotionPoint[]=[];let index=0,x=0,y=0,ended=false;
  while(index<tokens.length){
    const command=tokens[index++],upper=command.toUpperCase();
    if(upper==="E"){ended=true;break;}
    if(upper==="Z"){if(!points.length||points.length>=24)return;points.push({...points[0]});continue;}
    if(!["M","L","m","l"].includes(command)||index+1>=tokens.length||upper==="M"&&points.length>0)return;
    if(!points.length&&upper!=="M")return;
    const px=Number(tokens[index++]),py=Number(tokens[index++]);if(!Number.isFinite(px)||!Number.isFinite(py))return;
    if(command===command.toLowerCase()){x+=px*width;y+=py*height;}else{x=px*width;y=py*height;}
    if(Math.abs(x)>1280||Math.abs(y)>960||points.length>=24)return;
    points.push({x,y});
  }
  if(!ended||index!==tokens.length||points.length<2||Math.abs(points[0].x)>0.01||Math.abs(points[0].y)>0.01)return;
  points[0]={x:0,y:0};return points;
}
export function readNativeEffect(node:Element,width:number,height:number,notice:NoticeSink):ImportedEffect|undefined{
  const targetNodes=descendants(node,NS.p,"spTgt"),targetIds=[...new Set(targetNodes.map(n=>n.getAttribute("spid")||""))].filter(Boolean);
  if(!targetIds.length)return;
  if(targetNodes.some(n=>n.hasChildNodes()))notice("animation-target","Paragraph/subshape animation was applied to the imported whole object.");
  const times=[node,...descendants(node,NS.p,"cTn")];
  if(times.some(n=>n.hasAttribute("repeatCount")||n.hasAttribute("repeatDur"))||["1","true"].includes(node.getAttribute("autoRev")||"")){
    notice("animation-repeat","A repeated or autoreversing sequence was not imported; single pulse effects are supported.");return;
  }
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
    const origin=move?.getAttribute("origin"),path=move&&(!origin||origin==="layout")?readMotionPath(move.getAttribute("path")||"",width,height):undefined;
    if(!path){notice("animation-path","A curved, transformed or unsupported motion path was not imported.");return;}
    motion={...motion,phase:"motion",kind:"move",path};
  }else if(category==="emph"||(!fade&&(spin||scale))){
    if(spin){
      const degrees=spin.hasAttribute("by")?numeric(spin,"by"):spin.hasAttribute("from")&&spin.hasAttribute("to")?numeric(spin,"to")-numeric(spin,"from"):0;
      if(degrees!==21600000){notice("animation-spin","Only a clockwise full-turn spin is supported; this rotation was not imported.");return;}
      motion={...motion,phase:"emphasis",kind:"spin"};
    }else if(scale){
      if(!["1","true"].includes(first(scale,NS.p,"cTn")?.getAttribute("autoRev")||"")){notice("animation-scale","A permanent scale emphasis was not imported.");return;}
      const to=child(scale,NS.p,"to"),from=child(scale,NS.p,"from");
      if(numeric(to,"x",112000)!==112000||numeric(to,"y",112000)!==112000||numeric(from,"x",100000)!==100000||numeric(from,"y",100000)!==100000)notice("animation-scale","Pulse amplitude was normalized to 112%.");
      motion={...motion,phase:"emphasis",kind:"pulse"};
    }else{notice("animation-emphasis","An unsupported emphasis effect was not imported.");return;}
  }else{
    const filter=fade?.getAttribute("filter")||"fade";
    if(filter.startsWith("wipe")){motion.kind="wipe";if(filter!=="wipe(right)")notice("animation-direction","Wipe direction was normalized to the supported rightward reveal.");}
    else if(filter!=="fade"){notice("animation-filter",`Animation filter ${filter.slice(0,60)} was not imported.`);return;}
    if(fade?.getAttribute("transition")==="out")motion.phase="exit";
    if(scale){
      motion.kind="zoom";
      const entering=motion.phase!=="exit",from=child(scale,NS.p,"from"),to=child(scale,NS.p,"to");
      if(numeric(from,"x",entering?80000:100000)!==(entering?80000:100000)||numeric(to,"x",entering?100000:80000)!==(entering?100000:80000))notice("animation-scale","Zoom amplitude was normalized to the 80%-100% preset.");
    }
    if(move){
      const raw=move.getAttribute("path")||"";
      if(/[CQASTHV]/i.test(raw))notice("animation-path","A complex fly-in/out path was approximated by a straight entrance/exit preset.");
      const values=raw.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)?.map(Number)??[];
      const x=values.filter((_,i)=>i%2===0).reduce((m,v)=>Math.max(m,Math.abs(v)),0)*width;
      const y=values.filter((_,i)=>i%2===1).reduce((m,v)=>Math.max(m,Math.abs(v)),0)*height;
      motion.kind=y>x?"rise":"slide";
      if(Math.abs((y>x?y:x)-(y>x?24:50))>0.5)notice("animation-distance","Fly distance was normalized to the Workspace entrance/exit preset.");
    }
  }
  const acceleration=numeric(node,"accel"),deceleration=numeric(node,"decel");
  motion.easing=acceleration&&deceleration?"ease-in-out":acceleration?"ease-in":deceleration?"ease-out":"linear";
  if(![0,50000].includes(acceleration)||![0,50000].includes(deceleration))notice("animation-easing","Custom acceleration was approximated using a standard easing preset.");
  if(children(child(node,NS.p,"stCondLst"),NS.p,"cond").some(c=>first(c,NS.p,"tn")))notice("animation-condition","A time-node dependency needs visual review after conversion.");
  return {motion,targetIds,durationMs};
}
