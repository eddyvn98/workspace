import {describe,expect,it} from "vitest";
import {normalizeSlideScene} from "@/app/workspace/types/slideScene";
import {inspectSlideScene,sceneContrast} from "@/app/workspace/utils/slideSceneInspect";
const text={id:"headline",kind:"text",x:100,y:100,w:700,h:100,rotation:0,text:"Headline",fontSize:42,color:"#111827"};
describe("Scene V2 design quality checks",()=>{
  it("calculates readable contrast",()=>{expect(sceneContrast("#000000","#FFFFFF")).toBeCloseTo(21);expect(sceneContrast("#FFFFFF","#FFFFFF")).toBe(1);});
  it("catches visual overflow and low contrast",()=>{
    const scene=normalizeSlideScene({version:2,objects:[{...text,x:1100,color:"#EEEEEE"}]})!;
    expect(inspectSlideScene(scene).map(x=>x.code)).toEqual(expect.arrayContaining(["overflow","contrast"]));
  });
  it("warns about text overlap without changing content",()=>{
    const scene=normalizeSlideScene({version:2,objects:[text,{...text,id:"subtitle",x:120,y:125}]})!;
    expect(inspectSlideScene(scene).some(x=>x.code==="collision")).toBe(true);expect(scene.objects[0].text).toBe("Headline");
  });
  it("warns before exporting a noncontiguous group as ungrouped objects",()=>{
    const scene=normalizeSlideScene({version:2,objects:[{...text,id:"first",groupId:"g"},{id:"separator",kind:"shape",x:60,y:300,w:80,h:80,rotation:0},{...text,id:"second",groupId:"g",y:400}]})!;
    expect(inspectSlideScene(scene).some(x=>x.code==="group-export")).toBe(true);
    const adjacent={...scene,objects:[scene.objects[0],scene.objects[2],scene.objects[1]]};expect(inspectSlideScene(adjacent).some(x=>x.code==="group-export")).toBe(false);
  });
  it("inspects nested group spans even when the outer group is contiguous",()=>{
    const scene=normalizeSlideScene({version:2,objects:[
      {...text,id:"a",groupId:"outer",groupPath:["outer","inner"]},
      {...text,id:"b",groupId:"outer",groupPath:["outer"],y:250},
      {...text,id:"c",groupId:"outer",groupPath:["outer","inner"],y:400}
    ]})!;
    const warnings=inspectSlideScene(scene).filter(w=>w.code==="group-export");expect(warnings).toHaveLength(1);expect(warnings[0].message).toContain("inner");
  });
  it("uses the rotated frame instead of only the unrotated object rectangle",()=>{
    const scene=normalizeSlideScene({version:2,objects:[{...text,x:0,y:10,w:100,h:100,rotation:45}]})!;
    expect(inspectSlideScene(scene).some(w=>w.code==="overflow")).toBe(true);
  });
  it("does not report warnings on a clean scene",()=>{
    const scene=normalizeSlideScene({version:2,objects:[text]})!;expect(inspectSlideScene(scene)).toEqual([]);
  });
});
