import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";
import { objectGroupPath, withSceneGroupPath } from "../types/slideSceneGroupPath";
import { listSceneEffects, saveSceneEffects } from "./slideSceneEffects";
/** Select the outer group. A scoped editor removes its ancestor prefix for inner editing. */
export function expandSceneSelection(scene:SlideScene,ids:string[]):string[]{
  const initial=new Set(ids),groups=new Set(scene.objects.filter(o=>initial.has(o.id)&&o.groupId).map(o=>o.groupId!));
  return scene.objects.filter(o=>initial.has(o.id)||(o.groupId&&groups.has(o.groupId))).map(o=>o.id);
}
const normalized=(scene:SlideScene,objects:SlideSceneObject[])=>normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9")??scene;
export function groupSceneObjects(scene:SlideScene,ids:string[],makeId:()=>string):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),members=scene.objects.filter(o=>selected.has(o.id));
  if(members.length<2||members.some(o=>o.locked||objectGroupPath(o).length>=16))return scene;
  const groupId=makeId();
  return normalized(scene,scene.objects.map(o=>selected.has(o.id)?withSceneGroupPath(o,[groupId,...objectGroupPath(o)]):o));
}
/** Remove one outer grouping level, retaining all inner groups and their contents. */
export function ungroupSceneObjects(scene:SlideScene,ids:string[]):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids));
  if(!scene.objects.some(o=>selected.has(o.id)&&o.groupId)||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  return normalized(scene,scene.objects.map(o=>selected.has(o.id)?withSceneGroupPath(o,objectGroupPath(o).slice(1)):o));
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
/** Fresh IDs for every copied group level; copied effects append after the original timeline. */
export function duplicateSceneSelection(scene:SlideScene,ids:string[],makeId:()=>string):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids)),groups=new Map<string,string>(),mapping=new Map<string,string>();
  const blocked=new Set(scene.objects.filter(o=>o.groupId&&selected.has(o.id)&&o.locked).map(o=>o.groupId!));
  const copies=scene.objects.filter(o=>selected.has(o.id)&&!o.locked&&!(o.groupId&&blocked.has(o.groupId))).map(o=>{
    const path=objectGroupPath(o).map(group=>{if(!groups.has(group))groups.set(group,makeId());return groups.get(group)!;});
    const id=makeId();mapping.set(o.id,id);
    return withSceneGroupPath({...structuredClone(o),id,x:o.x+24,y:o.y+24},path);
  });
  if(!copies.length||scene.objects.length+copies.length>120)return scene;
  const entries=listSceneEffects(scene.objects);
  if(!entries.length)return normalized(scene,[...scene.objects,...copies]);
  const copiedEntries=entries.filter(entry=>mapping.has(entry.objectId)).map(entry=>({...entry,objectId:mapping.get(entry.objectId)!,motion:structuredClone(entry.motion)}));
  const candidate={...scene,objects:[...scene.objects,...copies]},next=saveSceneEffects(candidate,[...entries,...copiedEntries]);
  return next===candidate?scene:next;
}
/** Change stacking without rearranging either nested members or effect order. */
export function moveSceneSelectionLayer(scene:SlideScene,ids:string[],direction:-1|1):SlideScene{
  const selected=new Set(expandSceneSelection(scene,ids));if(!selected.size||scene.objects.some(o=>selected.has(o.id)&&o.locked))return scene;
  const objects=[...scene.objects];let changed=false;
  if(direction===1){for(let i=objects.length-2;i>=0;i--)if(selected.has(objects[i].id)&&!selected.has(objects[i+1].id)){[objects[i],objects[i+1]]=[objects[i+1],objects[i]];changed=true;}}
  else{for(let i=1;i<objects.length;i++)if(selected.has(objects[i].id)&&!selected.has(objects[i-1].id)){[objects[i-1],objects[i]]=[objects[i],objects[i-1]];changed=true;}}
  if(!changed)return scene;
  const entries=listSceneEffects(scene.objects),next={...scene,objects};return entries.length?saveSceneEffects(next,entries):next;
}
