import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { MAX_OBJECT_EFFECTS, MAX_SCENE_EFFECTS, normalizeSceneMotion, type SceneMotion } from "@/app/workspace/types/slideSceneMotion";
import { child, children, descendants, elements, first, NS } from "./xml";
import { readNativeEffect } from "./timing-effects";
import type { NoticeSink } from "./model";
export type AnimationTargetMap=Map<string,string[]>;
/** IDs belong to the source node itself, never a nested group's first child. */
export function captureAnimationTargets(targets:AnimationTargetMap,node:Element,objects:SlideSceneObject[]):void{
  const names:Record<string,string>={sp:"nvSpPr",pic:"nvPicPr",graphicFrame:"nvGraphicFramePr",grpSp:"nvGrpSpPr"};
  const name=names[node.localName];if(!name)return;
  const properties=child(child(node,NS.p,name),NS.p,"cNvPr"),id=properties?.getAttribute("id");
  if(!id||!objects.length)return;
  if(targets.has(id))throw new Error(`Duplicate PowerPoint shape id ${id.slice(0,30)} makes animation targets ambiguous.`);
  targets.set(id,objects.map(o=>o.id));
}
function delay(node:Element,notice:NoticeSink):number{
  let result=0;
  for(const condition of children(child(node,NS.p,"stCondLst"),NS.p,"cond")){
    const value=condition.getAttribute("delay");
    if(value&&/^\d+$/.test(value))result=Math.max(result,Number(value));
    if(first(condition,NS.p,"tn"))notice("animation-condition","Referenced time-node conditions were approximated by their numeric delay.");
  }
  return result;
}
function relativeStart(effect:Element,group:Element,notice:NoticeSink):number{
  let sum=0,node:Element|null=effect;
  while(node){if(node.namespaceURI===NS.p&&node.localName==="cTn")sum+=delay(node,notice);if(node===group)break;node=node.parentElement;}
  return sum;
}
/** Only native main slide-click sequences are mapped; embedded commands are never invoked. */
export function importSceneTiming(document:Document,objects:SlideSceneObject[],targets:AnimationTargetMap,width:number,height:number,notice:NoticeSink):number{
  const timing=child(document.documentElement,NS.p,"timing");if(!timing)return 0;
  const timeNodes=descendants(timing,NS.p,"cTn");
  if(timeNodes.some(n=>n.getAttribute("nodeType")==="interactiveSeq"))notice("animation-interactive","Object-click interactive sequences are not imported; main slide-click builds are supported.");
  if(first(timing,NS.p,"cmd")||first(timing,NS.p,"audio")||first(timing,NS.p,"video"))notice("animation-media","Media/command timing nodes are not executed or imported.");
  const main=timeNodes.find(n=>n.getAttribute("nodeType")==="mainSeq");
  if(!main){notice("animation-sequence","This animation structure has no supported main sequence.");notice("animation","No supported whole-object animations were found in the main sequence.");return 0;}
  if(main.hasAttribute("repeatCount")||main.hasAttribute("repeatDur")){notice("animation-repeat","A repeating main sequence was not imported.");return 0;}
  const lookup=new Map(objects.map(o=>[o.id,o]));let order=0;
  for(const group of elements(child(main,NS.p,"childTnLst"))){
    const nodes=descendants(group,NS.p,"cTn").filter(n=>["entr","exit","emph","path"].includes(n.getAttribute("presetClass")||""));
    const anchor=child(group,NS.p,"cTn");
    if(anchor?.hasAttribute("repeatCount")||anchor?.hasAttribute("repeatDur")){notice("animation-repeat","A repeating click-build was not imported.");continue;}
    const click=children(child(anchor,NS.p,"stCondLst"),NS.p,"cond").some(n=>n.getAttribute("delay")==="indefinite")||nodes.some(n=>n.getAttribute("nodeType")==="clickEffect");
    const parsed=nodes.map((node,index)=>({node,index,start:relativeStart(node,group,notice),effect:readNativeEffect(node,width,height,notice)})).filter(entry=>entry.effect!==undefined).sort((a,b)=>a.start-b.start||a.index-b.index);
    let previousStart=0,previousEnd=0,firstInGroup=true;
    for(const entry of parsed){
      const effect=entry.effect!;
      const ids=[...new Set(effect.targetIds.flatMap(id=>targets.get(id)??[]))].filter(id=>lookup.has(id));
      if(!ids.length){notice("animation-target","An animation refers to an object that could not be imported.");continue;}
      if(ids.length>1&&effect.motion.phase==="emphasis")notice("animation-group","A compound target's scale/rotation is applied to its editable parts; group-origin emphasis needs visual review.");
      let trigger:SceneMotion["trigger"],delayMs:number;
      if(firstInGroup){trigger=click?"on-click":order?"after-previous":"with-previous";delayMs=entry.start;}
      else if(entry.node.getAttribute("nodeType")==="afterEffect"&&entry.start>=previousEnd){trigger="after-previous";delayMs=entry.start-previousEnd;}
      else{trigger="with-previous";delayMs=Math.max(0,entry.start-previousStart);}
      if(!Number.isFinite(delayMs)||delayMs>10000)notice("animation-delay","An excessive or invalid effect delay was fitted to the supported range.");
      for(const [index,id] of ids.entries()){
        const object=lookup.get(id)!,animations=object.animations??[];
        if(animations.length>=MAX_OBJECT_EFFECTS||order>=MAX_SCENE_EFFECTS)throw new Error("Imported animations exceed 12 effects per object or 240 effects per slide.");
        const motion=normalizeSceneMotion({...effect.motion,trigger:index?"with-previous":trigger,delayMs:index?0:delayMs,order:order++});
        if(motion)animations.push(motion);object.animations=animations;
      }
      previousStart=entry.start;previousEnd=entry.start+effect.durationMs;firstInGroup=false;
    }
  }
  if(!order)notice("animation","No supported whole-object animations were found in the main sequence.");
  return order;
}
