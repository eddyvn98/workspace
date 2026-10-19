/** Outermost -> innermost group path; old groupId-only decks remain readable. */
export type SceneGrouping={groupId?:string;groupPath?:string[]};
const valid=(value:unknown):value is string=>typeof value==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function objectGroupPath(object:SceneGrouping):string[]{return object.groupPath??(object.groupId?[object.groupId]:[]);}
export function normalizeSceneGrouping(raw:Record<string,unknown>):SceneGrouping|undefined{
  if(raw.groupPath===undefined)return valid(raw.groupId)?{groupId:raw.groupId}:{};
  if(!Array.isArray(raw.groupPath)||raw.groupPath.length>16||raw.groupPath.some(v=>!valid(v))||new Set(raw.groupPath).size!==raw.groupPath.length)return;
  const path=raw.groupPath as string[];
  if(raw.groupId!==undefined&&raw.groupId!==path[0])return;
  return path.length?{groupId:path[0],groupPath:[...path]}:{};
}
/** A native group cannot have two parents or contain itself indirectly. */
export function validSceneGroupHierarchy(objects:SceneGrouping[]):boolean{
  const parents=new Map<string,string|null>();
  for(const object of objects){
    const path=objectGroupPath(object);
    for(let i=0;i<path.length;i++){
      const parent=i?path[i-1]:null;
      if(parents.has(path[i])&&parents.get(path[i])!==parent)return false;
      parents.set(path[i],parent);
    }
  }
  for(const group of parents.keys()){
    const seen=new Set<string>();let next:string|null|undefined=group;
    while(next!==null&&next!==undefined){if(seen.has(next))return false;seen.add(next);next=parents.get(next);}
  }
  return true;
}
export function withSceneGroupPath<T extends SceneGrouping>(object:T,path:string[]):T{
  const next={...object};delete next.groupId;delete next.groupPath;
  if(path.length){next.groupId=path[0];next.groupPath=[...path];}return next;
}
