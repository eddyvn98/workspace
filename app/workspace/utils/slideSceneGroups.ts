import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";
import { listSceneEffects, saveSceneEffects } from "./slideSceneEffects";
/** Logical groups keep members independently editable and exportable. */
export function expandSceneSelection(scene:SlideScene,ids:string[]):string[]{
  const initial=new Set(ids),groups=new Set(scene.objects.filter(o=>initial.has(o.id)&&o.groupId).map(o=>o.groupId!));
  return scene.objects.filter(o=>initial.has(o.id)||(o.groupId&&groups.has(o.groupId))).map(o=>o.id);
}
const normalized=(scene:SlideScene,objects:SlideSceneObject[])=>normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9")??scene;
export function groupSceneObjects(scene:SlideScene,ids:string[],makeId:()=>string):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),members=scene.objects.filter(o=>selected.has(o.id));
  if(members.length<2||members.some(o=>o.locked))return scene;
  const groupId=makeId();return normalized(scene,scene.objects.map(o=>selected.has(o.id)?{...o,groupId}:o));
}
export function ungroupSceneObjects(scene:SlideScene,ids:string[]):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids));
  if(!scene.objects.some(o=>selected.has(o.id)&&o.groupId)||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  return normalized(scene,scene.objects.map(o=>{if(!selected.has(o.id))return o;const next={...o};delete next.groupId;return next;}));
}
export function translateSceneSelection(scene:SlideScene,ids:string[],dx:number,dy:number):SlideScene{
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return scene;
  const selected=new Set(expandSceneSelection(scene,ids));
  const blocked=new Set(scene.objects.filter(o=>o.groupId&&selected.has(o.id)&&o.locked).map(o=>o.groupId!));
  return normalized(scene,scene.objects.map(o=>selected.has(o.id)&&!o.locked&&!(o.groupId&&blocked.has(o.groupId))?{...o,x:o.x+dx,y:o.y+dy}:o));
}
export function deleteSceneSelection(scene:SlideScene,ids:string[]):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids));
  const blocked=new Set(scene.objects.filter(o=>selected.has(o.id)&&o.locked&&o.groupId).map(o=>o.groupId!));
  return {...scene,objects:scene.objects.filter(o=>!selected.has(o.id)||o.locked||(o.groupId&&blocked.has(o.groupId)))};
}
/** New objects/groups are independent. Their copied effects append after the existing timeline. */
export function duplicateSceneSelection(scene:SlideScene,ids:string[],makeId:()=>string):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),groups=new Map<string,string>(),mapping=new Map<string,string>();
  const blocked=new Set(scene.objects.filter(o=>o.groupId&&selected.has(o.id)&&o.locked).map(o=>o.groupId!));
  const copies=scene.objects.filter(o=>selected.has(o.id)&&!o.locked&&!(o.groupId&&blocked.has(o.groupId))).map(o=>{
    if(o.groupId&&!groups.has(o.groupId))groups.set(o.groupId,makeId());
    const id=makeId();mapping.set(o.id,id);
    return {...structuredClone(o),id,x:o.x+24,y:o.y+24,...(o.groupId?{groupId:groups.get(o.groupId)!}:{})};
  });
  if(!copies.length||scene.objects.length+copies.length>120)return scene;
  const entries=listSceneEffects(scene.objects);
  if(!entries.length)return normalized(scene,[...scene.objects,...copies]);
  const copiedEntries=entries.filter(entry=>mapping.has(entry.objectId)).map(entry=>({...entry,objectId:mapping.get(entry.objectId)!,motion:structuredClone(entry.motion)}));
  // Reindexing prevents existing layer changes from reordering the effect sequence.
  const candidate={...scene,objects:[...scene.objects,...copies]};
  const next=saveSceneEffects(candidate,[...entries,...copiedEntries]);
  return next===candidate?scene:next;
}
/** Change paint order without changing animation order, including legacy effects. */
export function moveSceneSelectionLayer(scene:SlideScene,ids:string[],direction:-1|1):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids));
  if(!selected.size||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  const objects=[...scene.objects];let changed=false;
  if(direction===1){for(let i=objects.length-2;i>=0;i--)if(selected.has(objects[i].id)&&!selected.has(objects[i+1].id)){[objects[i],objects[i+1]]=[objects[i+1],objects[i]];changed=true;}}
  else{for(let i=1;i<objects.length;i++)if(selected.has(objects[i].id)&&!selected.has(objects[i-1].id)){[objects[i-1],objects[i]]=[objects[i],objects[i-1]];changed=true;}}
  if(!changed)return scene;
  const entries=listSceneEffects(scene.objects),next={...scene,objects};
  return entries.length?saveSceneEffects(next,entries):next;
}
