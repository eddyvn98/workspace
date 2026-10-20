import { describe, expect, it } from "vitest";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { alignSceneObjects, duplicateSceneObjects, nudgeSceneObjects, resizeSceneRect, snapSceneRect, distributeSceneObjects } from "@/app/workspace/utils/slideSceneGeometry";

const base = normalizeSlideScene({version:2,objects:[
{id:"a",kind:"text",x:40,y:80,w:200,h:100,rotation:0,text:"Title"},
{id:"b",kind:"shape",x:330,y:130,w:150,h:80,rotation:0},
{id:"c",kind:"shape",x:800,y:500,w:100,h:50,rotation:0}
]})!;

describe("Slide scene editing geometry",()=>{
  it("resizes south east and north west correctly",()=>{
    expect(resizeSceneRect({x:100,y:200,w:200,h:100},"se",30,40)).toEqual({x:100,y:200,w:230,h:140});
    expect(resizeSceneRect({x:100,y:200,w:200,h:100},"nw",20,10)).toEqual({x:120,y:210,w:180,h:90});
  });
  it("preserves ratio on shift resize",()=>{
    const r=resizeSceneRect({x:0,y:0,w:200,h:100},"se",100,0,true);
    expect(r.w/r.h).toBe(2);
  });
  it("snaps scene geometry",()=>{
    expect(snapSceneRect({x:11,y:19,w:101,h:100})).toEqual({x:8,y:16,w:104,h:104});
  });
  it("aligns selected objects without touching others",()=>{
    const x=alignSceneObjects(base,["a","b"],"left");
    expect(x.objects[0].x).toBe(40);
    expect(x.objects[1].x).toBe(40);
    expect(x.objects[2].x).toBe(800);
  });
  it("can distribute three objects",()=>{
    const x=distributeSceneObjects(base,["a","b","c"],"x");
    expect(x.objects[0].x).toBe(40);
    expect(x.objects[2].x).toBe(800);
    expect(x.objects[1].x).toBeGreaterThan(40);
  });
  it("nudge respects locked objects",()=>{
    const scene={...base,objects:base.objects.map(o=>o.id==="b"?{...o,locked:true}:o)};
    const x=nudgeSceneObjects(scene,["a","b"],10,0);
    expect(x.objects[0].x).toBe(50);
    expect(x.objects[1].x).toBe(330);
  });
  it("duplicates without reusing ids",()=>{
    const x=duplicateSceneObjects(base,["a"],()=>"new-id");
    expect(x.objects.map(o=>o.id)).toEqual(["a","b","c","new-id"]);
  });
});
