import type { SlideScene } from "@/app/workspace/types/slideScene";
import { compileSceneTimeline } from "@/app/workspace/utils/slideSceneSchedule";
import { nativeEffectBehaviors, visibilityBehavior } from "./pptx-motion-behaviors";
const condition=(delay:number|"indefinite")=>`<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`;
/** Main-sequence builds match the browser's click/after/with-previous schedule. */
export function scenePptxTiming(scene:SlideScene):string {
  const timeline=compileSceneTimeline(scene.objects);
  if(!timeline.cues.length)return "";
  const shapeIds=new Map(scene.objects.map((o,index)=>[o.id,index+2]));
  let next=3;const nextId=()=>next++;
  const context=(id:string)=>({nextId,shapeId:shapeIds.get(id)!,width:scene.width,height:scene.height});
  const initialized=new Set<string>(),initial:string[]=[];
  for(const cue of timeline.cues){
    if(initialized.has(cue.id))continue;
    initialized.add(cue.id);
    if(cue.phase==="entrance")initial.push(visibilityBehavior(context(cue.id),false));
  }
  const steps=[...new Set(timeline.cues.map(cue=>cue.step))];
  const builds=steps.map(step=>{
    const groupId=nextId(),parallelId=nextId();
    const effects=timeline.cues.filter(cue=>cue.step===step).map(cue=>{
      const id=nextId();
      const nodeType=cue.trigger==="on-click"?"clickEffect":cue.trigger==="after-previous"?"afterEffect":"withEffect";
      const category=cue.phase==="entrance"?"entr":cue.phase==="exit"?"exit":cue.phase==="motion"?"path":"emph";
      const acceleration=cue.easing==="ease-in"||cue.easing==="ease-in-out"?' accel="50000"':"";
      const deceleration=cue.easing===undefined||cue.easing==="ease-out"||cue.easing==="ease-in-out"?' decel="50000"':"";
      return `<p:par><p:cTn id="${id}" dur="${cue.durationMs}" fill="hold" presetClass="${category}" nodeType="${nodeType}"${acceleration}${deceleration}>${condition(cue.startMs)}<p:childTnLst>${nativeEffectBehaviors(cue,context(cue.id))}</p:childTnLst></p:cTn></p:par>`;
    }).join("");
    return `<p:par><p:cTn id="${groupId}" fill="hold">${condition(step===0?0:"indefinite")}<p:childTnLst><p:par><p:cTn id="${parallelId}" fill="hold">${condition(0)}<p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }).join("");
  const navigation=(name:string,event:string)=>`<p:${name}><p:cond evt="${event}" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:${name}>`;
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${initial.join("")}<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${builds}</p:childTnLst></p:cTn>${navigation("prevCondLst","onPrev")}${navigation("nextCondLst","onNext")}</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}
