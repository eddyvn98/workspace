import { normalizeSlideScene, type SlideScene } from "../types/slideScene";
import { objectGroupPath, withSceneGroupPath } from "../types/slideSceneGroupPath";
const inside=(path:string[],prefix:string[])=>prefix.every((part,i)=>path[i]===part);
export function sceneInGroup(scene:SlideScene,prefix:string[]):SlideScene{
  if(!prefix.length)return scene;
  const members=scene.objects.filter(o=>inside(objectGroupPath(o),prefix));
  if(!members.length)throw new Error("The selected group no longer exists.");
  return {...scene,objects:members.map(o=>withSceneGroupPath(o,objectGroupPath(o).slice(prefix.length)))};
}
export function sceneChildGroups(scene:SlideScene,prefix:string[]):Array<{id:string;label:string;count:number}>{
  const found=new Map<string,{id:string;label:string;count:number}>();
  for(const object of scene.objects){
    const path=objectGroupPath(object);if(!inside(path,prefix))continue;const id=path[prefix.length];if(!id)continue;
    const item=found.get(id);if(item)item.count++;else found.set(id,{id,label:object.text?.slice(0,32)||`${object.kind} group`,count:1});
  }
  return [...found.values()];
}
/** Replace only member slots. Unrelated interspersed layers are retained in place, never overwritten. */
export function applySceneGroupEdit(original:SlideScene,edited:SlideScene,prefix:string[]):SlideScene{
  if(!prefix.length)return edited;
  if(edited.width!==original.width||edited.height!==original.height)throw new Error("Group editing cannot change the slide size.");
  const before=sceneInGroup(original,prefix),ids=new Set(before.objects.map(o=>o.id)),outside=new Set(original.objects.filter(o=>!ids.has(o.id)).map(o=>o.id));
  if(edited.objects.some(o=>outside.has(o.id)))throw new Error("An edited group contains an outside object identifier.");
  const members=edited.objects.map(o=>withSceneGroupPath(o,[...prefix,...objectGroupPath(o)]));
  if(original.objects.length-ids.size+members.length>120)throw new Error("The full slide cannot exceed 120 objects.");
  const result:SlideScene["objects"]=[],lastIndex=original.objects.reduce((last,o,i)=>ids.has(o.id)?i:last,-1);let cursor=0;
  original.objects.forEach((object,i)=>{
    if(ids.has(object.id)){if(cursor<members.length)result.push(members[cursor++]);}else result.push(object);
    if(i===lastIndex)while(cursor<members.length)result.push(members[cursor++]);
  });
  const normalized=normalizeSlideScene({...original,objects:result},original.height===960?"4:3":"16:9");
  const baseline=normalizeSlideScene(original,original.height===960?"4:3":"16:9");
  if(!normalized||!baseline)throw new Error("Invalid nested group edit or group depth limit exceeded.");
  for(const object of baseline.objects.filter(o=>o.locked)){
    const next=normalized.objects.find(o=>o.id===object.id);
    if(JSON.stringify(next)!==JSON.stringify(object))throw new Error("A locked group member cannot be changed or deleted.");
  }
  return normalized;
}
