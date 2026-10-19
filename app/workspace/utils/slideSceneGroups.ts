import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene } from "../types/slideScene";

/** Logical groups keep members independently editable and exportable. */
export function expandSceneSelection(scene: SlideScene, ids: string[]): string[] {
  const initial = new Set(ids);
  const groups = new Set(scene.objects.filter(o => initial.has(o.id) && o.groupId).map(o => o.groupId!));
  return scene.objects.filter(o => initial.has(o.id) || (o.groupId && groups.has(o.groupId))).map(o => o.id);
}
const normalized = (scene: SlideScene, objects: SlideSceneObject[]) =>
  normalizeSlideScene({...scene, objects}, scene.height === 960 ? "4:3" : "16:9") ?? scene;

export function groupSceneObjects(scene: SlideScene, ids: string[], makeId: () => string): SlideScene {
  const selection = new Set(expandSceneSelection(scene, ids));
  const members = scene.objects.filter(o => selection.has(o.id));
  if (members.length < 2 || members.some(o => o.locked)) return scene;
  const groupId = makeId();
  return normalized(scene, scene.objects.map(o => selection.has(o.id) ? {...o, groupId} : o));
}

export function ungroupSceneObjects(scene: SlideScene, ids: string[]): SlideScene {
  const selected = new Set(expandSceneSelection(scene, ids));
  if (!scene.objects.some(o => selected.has(o.id) && o.groupId) || scene.objects.some(o => selected.has(o.id) && o.locked)) return scene;
  return normalized(scene, scene.objects.map(o => {
    if (!selected.has(o.id)) return o;
    const object = {...o};
    delete object.groupId;
    return object;
  }));
}

/** Move the entire selected group using a single delta; never move locked members. */
export function translateSceneSelection(scene: SlideScene, ids: string[], dx: number, dy: number): SlideScene {
  const selected = new Set(expandSceneSelection(scene, ids));
  const blockedGroups = new Set(scene.objects.filter(o => o.groupId && selected.has(o.id) && o.locked).map(o => o.groupId!));
  const objects = scene.objects.map(o => selected.has(o.id) && !o.locked && !(o.groupId && blockedGroups.has(o.groupId))
    ? {...o, x:o.x+dx, y:o.y+dy} : o);
  return normalized(scene, objects);
}

export function deleteSceneSelection(scene: SlideScene, ids: string[]): SlideScene {
  const selected = new Set(expandSceneSelection(scene, ids));
  const blockedGroups = new Set(scene.objects.filter(o=>selected.has(o.id)&&o.locked&&o.groupId).map(o=>o.groupId!));
  return {...scene, objects:scene.objects.filter(o => !selected.has(o.id) || o.locked || (o.groupId && blockedGroups.has(o.groupId)))};
}

/** Duplicate selected groups with new ids to avoid unintentionally linking copy and original. */
export function duplicateSceneSelection(scene: SlideScene, ids: string[], makeId: () => string): SlideScene {
  const selected = new Set(expandSceneSelection(scene, ids));
  const groups = new Map<string,string>();
  const blockedGroups = new Set(scene.objects.filter(o => o.groupId && selected.has(o.id) && o.locked).map(o => o.groupId!));
  const copies = scene.objects.filter(o => selected.has(o.id) && !o.locked && !(o.groupId && blockedGroups.has(o.groupId))).map(o => {
    if (o.groupId && !groups.has(o.groupId)) groups.set(o.groupId, makeId());
    return {
      ...o, id:makeId(), x:o.x+24, y:o.y+24,
      ...(o.groupId ? {groupId:groups.get(o.groupId)!} : {}),
      ...(o.motion ? {motion:{...o.motion}} : {}),
      ...(o.series ? {series:o.series.map(s=>({...s}))} : {}),
    };
  });
  if (!copies.length || scene.objects.length + copies.length > 120) return scene;
  return normalized(scene,[...scene.objects,...copies]);
}

/** Change stacking by one step while retaining the relative order of selected group members. */
export function moveSceneSelectionLayer(scene: SlideScene, ids: string[], direction: -1 | 1): SlideScene {
  const selection = new Set(expandSceneSelection(scene, ids));
  if (!selection.size || scene.objects.some(o=>selection.has(o.id)&&o.locked)) return scene;
  const objects = [...scene.objects];
  let changed = false;
  if (direction === 1) {
    for (let i=objects.length-2;i>=0;i--) {
      if (selection.has(objects[i].id) && !selection.has(objects[i+1].id)) {
        [objects[i],objects[i+1]]=[objects[i+1],objects[i]];changed=true;
      }
    }
  } else {
    for (let i=1;i<objects.length;i++) {
      if (selection.has(objects[i].id) && !selection.has(objects[i-1].id)) {
        [objects[i-1],objects[i]]=[objects[i],objects[i-1]];changed=true;
      }
    }
  }
  return changed ? {...scene,objects} : scene;
}
