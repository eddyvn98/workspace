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
    expect(inspectSlideScene(scene).some(x=>x.code==="collision")).toBe(true);
    expect(scene.objects[0].text).toBe("Headline");
  });
  it("does not report warnings on a clean scene",()=>{
    const scene=normalizeSlideScene({version:2,objects:[text]})!;
    expect(inspectSlideScene(scene)).toEqual([]);
  });
});
