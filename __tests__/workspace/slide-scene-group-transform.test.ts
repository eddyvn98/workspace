import { describe, expect, it } from "vitest";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { groupSceneObjects } from "@/app/workspace/utils/slideSceneGroups";
import { resizeSceneSelection, rotateSceneSelection, sceneSelectionBounds } from "@/app/workspace/utils/slideSceneGroupTransform";
import { imageShape, chartShape } from "@/lib/workspace/pptx-elements";

const base=normalizeSlideScene({version:2,objects:[
  {id:"a",kind:"text",x:100,y:100,w:200,h:100,rotation:0,text:"Title",fontSize:40},
  {id:"b",kind:"shape",x:400,y:200,w:100,h:200,rotation:0,fill:"#334455"},
  {id:"outside",kind:"shape",x:900,y:200,w:100,h:100,rotation:0},
]})!;
const grouped=groupSceneObjects(base,["a","b"],()=>"group-a");

describe("Scene V2 group transforms",()=>{
  it("calculates bounds and scales member frames as one edit",()=>{
    expect(sceneSelectionBounds(grouped,["b"])).toEqual({x:100,y:100,w:400,h:300});
    const updated=resizeSceneSelection(grouped,["a"],{x:50,y:70,w:800,h:600});
    expect(updated.objects[0]).toMatchObject({x:50,y:70,w:400,h:200,fontSize:80});
    expect(updated.objects[1]).toMatchObject({x:650,y:270,w:200,h:400});
    expect(updated.objects[2]).toEqual(grouped.objects[2]);
  });
  it("rotates element centres and their own angle around the selection pivot",()=>{
    const updated=rotateSceneSelection(grouped,["a"],90);
    expect(updated.objects[0]).toMatchObject({x:300,y:100,rotation:90});
    expect(updated.objects[1]).toMatchObject({x:200,y:300,rotation:90});
    expect(updated.objects[2]).toEqual(grouped.objects[2]);
  });
  it("refuses to transform locked members, avoids mutating other selections",()=>{
    const locked={...grouped,objects:grouped.objects.map(o=>o.id==="b"?{...o,locked:true}:o)};
    expect(resizeSceneSelection(locked,["a"],{x:0,y:0,w:200,h:200})).toBe(locked);
    expect(rotateSceneSelection(locked,["a"],30)).toBe(locked);
  });
  it("handles degenerate and invalid transforms without losing original data",()=>{
    expect(resizeSceneSelection(grouped,["a"],{x:0,y:0,w:0,h:10})).toBe(grouped);
    expect(rotateSceneSelection(grouped,["a"],NaN)).toBe(grouped);
  });
  it("supports 4:3 canvas and keeps groups on roundtrip",()=>{
    const scene=normalizeSlideScene({version:2,objects:base.objects},"4:3")!;
    const updated=resizeSceneSelection(scene,["a","b"],{x:0,y:0,w:600,h:600});
    expect(updated.height).toBe(960);
    expect(normalizeSlideScene(updated,"4:3")?.objects).toHaveLength(3);
  });
  it("exports image and chart rotations as native OOXML transforms",()=>{
    const image=imageShape(2,"rId3","image",10,20,200,120,undefined,30);
    const chart=chartShape(3,"rId4",50,80,400,200,45);
    expect(image).toContain('<a:xfrm rot="1800000">');
    expect(chart).toContain('<p:xfrm rot="2700000">');
  });
});
