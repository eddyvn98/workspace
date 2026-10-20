import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";
import { MAX_OBJECT_EFFECTS, MAX_SCENE_EFFECTS, normalizeSceneMotion, objectMotions, type SceneMotion } from "../types/slideSceneMotion";
export type SceneEffectEntry = { objectId: string; index: number; motion: SceneMotion };
export function listSceneEffects(objects: Pick<SlideSceneObject, "id" | "motion" | "animations">[]): SceneEffectEntry[] {
  const entries = objects.flatMap(o => objectMotions(o).map((motion,index) => ({objectId:o.id,index,motion})));
  return entries.map((entry,position)=>({entry,position}))
    .sort((a,b)=>(a.entry.motion.order ?? a.position)-(b.entry.motion.order ?? b.position) || a.position-b.position)
    .map(({entry})=>entry);
}
/** Pure operation shared by timeline, SDK and future command execution; no browser dependency. */
export function saveSceneEffects(scene: SlideScene, entries: SceneEffectEntry[]): SlideScene {
  if (entries.length > MAX_SCENE_EFFECTS) return scene;
  const byObject = new Map<string, SceneMotion[]>();
  for (const [order, entry] of entries.entries()) {
    if (!scene.objects.some(o=>o.id===entry.objectId)) return scene;
    const motion = normalizeSceneMotion({...entry.motion,order});
    if (!motion) return scene;
    const list = byObject.get(entry.objectId) ?? [];
    if (list.length >= MAX_OBJECT_EFFECTS) return scene;
    list.push(motion); byObject.set(entry.objectId,list);
  }
  const objects = scene.objects.map(o => {
    const next = {...o, animations:byObject.get(o.id) ?? []};
    delete next.motion;
    return next;
  });
  return normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9") ?? scene;
}
export function addSceneEffect(scene: SlideScene, objectId: string, motion: SceneMotion): SlideScene {
  const object = scene.objects.find(o=>o.id===objectId);
  if (!object || object.locked || objectMotions(object).length>=MAX_OBJECT_EFFECTS) return scene;
  return saveSceneEffects(scene,[...listSceneEffects(scene.objects),{objectId,index:objectMotions(object).length,motion}]);
}
export function editSceneEffect(scene: SlideScene, position: number, patch: Partial<SceneMotion> | "delete" | "up" | "down"): SlideScene {
  const entries = listSceneEffects(scene.objects), entry = entries[position];
  if (!entry || scene.objects.find(o=>o.id===entry.objectId)?.locked) return scene;
  if (patch === "delete") entries.splice(position,1);
  else if (patch === "up" || patch === "down") {
    const next = position + (patch === "up" ? -1 : 1);
    if (!entries[next] || scene.objects.find(o=>o.id===entries[next].objectId)?.locked) return scene;
    [entries[position],entries[next]] = [entries[next],entries[position]];
  } else entries[position] = {...entry,motion:{...entry.motion,...patch}};
  return saveSceneEffects(scene,entries);
}
