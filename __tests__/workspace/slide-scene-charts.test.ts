import { describe,expect,it } from "vitest";
import { normalizeSlideScene,sceneObject } from "@/app/workspace/types/slideScene";
import { buildDeckSlides } from "@/app/api/workspaces/[id]/agent/slideDeckCreate";
const obj={id:"revenue",kind:"chart",x:50,y:100,w:740,h:400,rotation:0,series:[{label:"Q1",value:14},{label:"Q2",value:25}]};
describe("Scene V2 editable charts",()=>{
  it("accepts valid chart series",()=>{const scene=normalizeSlideScene({version:2,objects:[obj]});expect(scene?.objects[0].series?.[1].value).toBe(25);});
  it("rejects invalid chart values and empty series",()=>{
    for(const series of [[],[{label:"X",value:-1}],[{label:"X",value:NaN}],[{label:"X",value:"7"}]]){
      expect(normalizeSlideScene({version:2,objects:[{...obj,series}]})).toBeUndefined();
    }
  });
  it("supports AI scene-only deck with chart",()=>{
    const out=buildDeckSlides([{name:"Metrics",scene:{version:2,objects:[obj]}}],[]);
    expect(out.ok).toBe(true);
  });
  it("creates a native scene chart with editable series",()=>{
    const chart=sceneObject("chart");
    expect(chart.kind).toBe("chart");
    expect(chart.series?.length).toBeGreaterThan(1);
  });
});
