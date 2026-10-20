import { describe, expect, it } from "vitest";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
import { defaultSceneChart } from "@/app/workspace/types/slideSceneChart";
import { defaultSceneGradient, defaultSceneShadow } from "@/app/workspace/types/slideScenePaint";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { objectGroupPath } from "@/app/workspace/types/slideSceneGroupPath";
const box={x:100,y:100,w:400,h:250};
describe("Shared slide SDK feature parity",()=>{
  it("authors structured charts and still supports legacy chart arrays",()=>{
    const deck=createSlideScript("Charts");deck.slide("Data",s=>{
      s.chart({...defaultSceneChart(),type:"line"},box);
      s.chart([{label:"Old",value:4}],{...box,x:550});
    });
    const result=deck.build().action.slides[0].scene.objects;
    expect(result[0].chart?.type).toBe("line");expect(result[0].chart?.series).toHaveLength(2);
    expect(result[1].series).toEqual([{label:"Old",value:4}]);
  });
  it("supports paints masks and exact source crop through the same scene validator",()=>{
    const deck=createSlideScript("Effects");deck.slide("Paint",s=>{
      s.shape("#2563EB",box,{gradient:defaultSceneGradient(),shadow:defaultSceneShadow()});
      s.image("/api/workspace-images/ws_123",{...box,x:550},{imageMask:{shapeKind:"ellipse"},imageCrop:{left:0.1,top:0.2,right:0.1,bottom:0.2},imageViewport:{left:0,top:0,right:0,bottom:0}});
    });
    const scene=deck.build().action.slides[0].scene;
    expect(scene.objects[0].gradient).toBeDefined();expect(scene.objects[1].imageCrop?.top).toBe(0.2);
    expect(normalizeSlideScene(scene)?.objects).toEqual(scene.objects);
  });
  it("groups and ungroups nested references without losing objects or effects",()=>{
    const deck=createSlideScript("Nested","4:3");let inner="",outer="";
    deck.slide("Groups",s=>{
      const a=s.text("A",box),b=s.text("B",{...box,x:550}),c=s.shape("#2563EB",{...box,y:450});
      s.effect(a,{kind:"fade",phase:"entrance",trigger:"on-click"});inner=s.group([a,b]);outer=s.group([inner,c]);
    });
    const scene=deck.build().action.slides[0].scene;expect(scene.height).toBe(960);
    expect(objectGroupPath(scene.objects[0])).toEqual([outer,inner]);expect(objectGroupPath(scene.objects[2])).toEqual([outer]);
    expect(scene.objects[0].animations?.[0].kind).toBe("fade");
    const another=createSlideScript("Ungroup");another.slide("One",s=>{const a=s.text("A",box),b=s.text("B",box);const g=s.group([a,b]);s.ungroup([g]);});
    expect(another.build().action.slides[0].scene.objects.every(o=>!o.groupId)).toBe(true);
  });
  it("creates diagrams as editable nested primitives and validates bad references",()=>{
    const deck=createSlideScript("Diagram");deck.slide("Process",s=>{
      const ids=s.diagram({version:1,layout:"process",nodes:[{id:"a",label:"Plan"},{id:"b",label:"Build"}],edges:[{from:"a",to:"b"}],color:"#2563EB"},{x:100,y:100,w:900,h:450});
      expect(ids.length).toBeGreaterThan(2);expect(()=>s.group(["unknown"])).toThrow("Unknown");
    });
    const objects=deck.build().action.slides[0].scene.objects;
    expect(objects.filter(o=>o.kind==="text").map(o=>o.text)).toEqual(["Plan","Build"]);
    expect(objects.every(o=>o.kind==="shape"||o.kind==="text")).toBe(true);
  });
  it("keeps rich cell content instead of converting it to plain values",()=>{
    const deck=createSlideScript("Table");deck.slide("Table",s=>s.table([[{text:"derived",richText:{version:1,paragraphs:[{runs:[{text:"Mixed ",bold:true},{text:"cell",italic:true}]}]}}]],box));
    const cell=deck.build().action.slides[0].scene.objects[0].table!.rows[0][0];
    expect(cell.text).toBe("Mixed cell");expect(cell.richText?.paragraphs[0].runs[1].italic).toBe(true);
  });
});
