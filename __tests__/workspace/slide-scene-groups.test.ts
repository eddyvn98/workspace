import { describe, expect, it } from "vitest";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { deleteSceneSelection, duplicateSceneSelection, expandSceneSelection, groupSceneObjects, translateSceneSelection, ungroupSceneObjects } from "@/app/workspace/utils/slideSceneGroups";

const base = normalizeSlideScene({version:2,objects:[
  {id:"a",kind:"text",text:"A",x:20,y:40,w:100,h:80,rotation:0},
  {id:"b",kind:"shape",x:180,y:100,w:120,h:80,rotation:0},
  {id:"c",kind:"shape",x:400,y:120,w:100,h:70,rotation:0},
]})!;
describe("Slide Scene logical groups",()=>{
  const grouped=groupSceneObjects(base,["a","b"],()=>"group-1");
  it("persists groups and expands selection without altering z order",()=>{
    expect(grouped.objects.map(o=>o.id)).toEqual(["a","b","c"]);
    expect(grouped.objects[0].groupId).toBe("group-1");
    expect(grouped.objects[1].groupId).toBe("group-1");
    expect(expandSceneSelection(grouped,["b"])).toEqual(["a","b"]);
    expect(normalizeSlideScene(grouped)?.objects[0].groupId).toBe("group-1");
  });
  it("moves selected members as one change, leaving outsiders untouched",()=>{
    const moved=translateSceneSelection(grouped,["a"],40,20);
    expect(moved.objects.map(o=>o.x)).toEqual([60,220,400]);
    expect(moved.objects.map(o=>o.y)).toEqual([60,120,120]);
  });
  it("duplicates grouped elements using fresh logical group id",()=>{
    let index=0;
    const copied=duplicateSceneSelection(grouped,["b"],()=>`fresh-${++index}`);
    expect(copied.objects).toHaveLength(5);
    expect(copied.objects.slice(3).map(o=>o.groupId)).toEqual(["fresh-1","fresh-1"]);
    expect(copied.objects[0].groupId).toBe("group-1");
    expect(new Set(copied.objects.map(o=>o.id)).size).toBe(5);
  });
  it("deletes whole group, ungroup does not delete its members",()=>{
    expect(deleteSceneSelection(grouped,["b"]).objects.map(o=>o.id)).toEqual(["c"]);
    const independent=ungroupSceneObjects(grouped,["a"]);
    expect(independent.objects.map(o=>o.id)).toEqual(["a","b","c"]);
    expect(independent.objects.every(o=>!o.groupId)).toBe(true);
  });
  it("refuses grouping locked members and never moves locked objects",()=>{
    const locked={...base,objects:base.objects.map(o=>o.id==="b"?{...o,locked:true}:o)};
    expect(groupSceneObjects(locked,["a","b"],()=>"group-2")).toBe(locked);
    expect(translateSceneSelection(locked,["a","b"],10,0).objects.map(o=>o.x)).toEqual([30,180,400]);
  });
  it("returns the input on single-object grouping or no-op",()=>{
    expect(groupSceneObjects(base,["a"],()=>"unused")).toBe(base);
    expect(ungroupSceneObjects(base,["a"])).toBe(base);
  });
});
