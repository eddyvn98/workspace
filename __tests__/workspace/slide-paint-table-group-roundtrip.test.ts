// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeSlideScene, type SlideSceneObject } from "@/app/workspace/types/slideScene";
import { normalizeSceneTable } from "@/app/workspace/types/slideSceneTable";
import { defaultSceneGradient, defaultSceneShadow, normalizeSceneGradient, normalizeSceneShadow } from "@/app/workspace/types/slideScenePaint";
import { objectGroupPath } from "@/app/workspace/types/slideSceneGroupPath";
import { sceneInGroup, applySceneGroupEdit } from "@/app/workspace/utils/slideSceneGroupScope";
import { groupSceneObjects } from "@/app/workspace/utils/slideSceneGroups";
import { exportSceneShape } from "@/lib/workspace/pptx-scene";
import { exportScenePicture } from "@/lib/workspace/pptx-scene-paint";
import { exportSceneTable } from "@/lib/workspace/pptx-scene-table";
import { groupPptxSceneShapes } from "@/lib/workspace/pptx-scene-groups";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const shape=(id:string,x=100):SlideSceneObject=>({id,kind:"shape",x,y:100,w:200,h:120,rotation:0,fill:"#2563EB",stroke:"transparent"});
const rich={version:1 as const,paragraphs:[{runs:[{text:"Revenue ",bold:true,color:"#2563EB"},{text:"growth",italic:true,underline:true,color:"#DC2626"}]}]};
describe("Paint and rich table interchange",()=>{
  it("validates bounded declarative effects without allowing raw CSS/filter injection",()=>{
    expect(normalizeSceneGradient(defaultSceneGradient())).toBeDefined();expect(normalizeSceneShadow(defaultSceneShadow())).toBeDefined();
    expect(normalizeSceneGradient({...defaultSceneGradient(),angle:NaN})).toBeUndefined();
    expect(normalizeSceneGradient({...defaultSceneGradient(),stops:[{offset:0,color:"url(javascript:x)"},{offset:1,color:"#FFFFFF"}]})).toBeUndefined();
    expect(normalizeSceneShadow({...defaultSceneShadow(),blur:65})).toBeUndefined();
    expect(normalizeSlideScene({version:2,objects:[{...shape("g"),gradient:defaultSceneGradient(),shadow:defaultSceneShadow()}]})).toBeDefined();
  });
  it("preserves gradient stops shadow geometry and a masked image as editable data",async()=>{
    const zip=await importFixture(),gradient=defaultSceneGradient(),shadow=defaultSceneShadow();
    const box={...shape("g"),gradient,shadow};
    const image:SlideSceneObject={id:"masked",kind:"image",x:500,y:100,w:200,h:200,rotation:15,src:"/api/workspace-images/ws_abc",imageMask:{shapeKind:"ellipse"},shadow};
    zip.file("ppt/slides/slide1.xml",slideXml(exportSceneShape(box,2,1)+exportScenePicture(image,3,"rIdImg",{width:1,height:1},1)));
    const objects=(await parsePptx(await pack(zip),"paint.pptx")).slides[0].scene!.objects;
    const imported=objects.find(o=>o.kind==="shape")!,photo=objects.find(o=>o.kind==="image")!;
    expect(imported.gradient?.stops.map(s=>s.color.toUpperCase())).toEqual(gradient.stops.map(s=>s.color));
    expect(imported.gradient?.angle).toBeCloseTo(gradient.angle);
    expect(imported.shadow?.blur).toBeCloseTo(shadow.blur);expect(imported.shadow?.x).toBeCloseTo(shadow.x,2);expect(imported.shadow?.y).toBeCloseTo(shadow.y,2);
    expect(photo.imageMask?.shapeKind).toBe("ellipse");expect(photo.rotation).toBeCloseTo(15);
  });
  it("retains mixed text in native merged cells and their covered values",async()=>{
    const table=normalizeSceneTable({headerRow:false,rows:[[{text:"stale",richText:rich},{text:"Covered"}],[{text:"A"},{text:"B"}]],merges:[{row:0,column:0,rowSpan:1,colSpan:2}]})!;
    expect(table.rows[0][0].text).toBe("Revenue growth");
    const object:SlideSceneObject={id:"table",kind:"table",x:80,y:80,w:800,h:350,rotation:0,table,fontSize:24,color:"#0f172a",fill:"#2563EB"};
    const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(await exportSceneTable(object,2,1)));
    const imported=(await parsePptx(await pack(zip),"table.pptx")).slides[0].scene!.objects.find(o=>o.kind==="table")!.table!;
    expect(imported.merges).toEqual(table.merges);expect(imported.rows[0][1].text).toBe("Covered");
    const runs=imported.rows[0][0].richText!.paragraphs[0].runs;
    expect(runs[0].bold).toBe(true);expect(runs[1].italic).toBe(true);expect(runs[1].underline).toBe(true);
    expect(runs.map(r=>r.text).join("")).toBe("Revenue growth");
  });
  it("enforces aggregate cell formatting limits",()=>{
    const huge={version:1,paragraphs:Array.from({length:65},()=>({runs:[{text:"x"}]}))};
    expect(normalizeSceneTable({rows:[[{text:"",richText:huge}]]})).toBeUndefined();
    expect(normalizeSceneTable({rows:[[{text:"x".repeat(2001)}]]})).toBeUndefined();
  });
});
describe("Native nested grouping",()=>{
  const base=normalizeSlideScene({version:2,objects:[shape("a"),shape("b",400),shape("c",800)]})!;
  const inner=groupSceneObjects(base,["a","b"],()=>"inner"),outer=groupSceneObjects(inner,["a","c"],()=>"outer");
  it("writes recursive native groups and imports their member hierarchy",async()=>{
    const xml=groupPptxSceneShapes(outer,outer.objects.map((o,i)=>exportSceneShape(o,i+2,1)),1).join("");
    expect((xml.match(/<p:grpSp>/g)??[])).toHaveLength(2);
    const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(xml));
    const objects=(await parsePptx(await pack(zip),"nested.pptx")).slides[0].scene!.objects;
    expect(objectGroupPath(objects[0])).toHaveLength(2);expect(objectGroupPath(objects[1])).toHaveLength(2);expect(objectGroupPath(objects[2])).toHaveLength(1);
    expect(objects.map(o=>o.x)).toEqual(outer.objects.map(o=>o.x));
  });
  it("scoped group editing changes only member slots and retains ancestor paths",()=>{
    const scoped=sceneInGroup(outer,["outer","inner"]),edited={...scoped,objects:scoped.objects.map(o=>({...o,x:o.x+20}))};
    const merged=applySceneGroupEdit(outer,edited,["outer","inner"]);
    expect(merged.objects[0].x).toBe(120);expect(merged.objects[1].x).toBe(420);expect(merged.objects[2]).toEqual(outer.objects[2]);
    expect(objectGroupPath(merged.objects[0])).toEqual(["outer","inner"]);
  });
  it("refuses stale outside identifiers and locked cell mutations",()=>{
    const scoped=sceneInGroup(outer,["outer","inner"]);
    expect(()=>applySceneGroupEdit(outer,{...scoped,objects:[...scoped.objects,{...shape("c")}]} ,["outer","inner"])).toThrow("outside");
    const locked={...outer,objects:outer.objects.map(o=>o.id==="a"?{...o,locked:true}:o)},view=sceneInGroup(locked,["outer","inner"]);
    expect(()=>applySceneGroupEdit(locked,{...view,objects:view.objects.map(o=>({...o,x:o.x+10}))},["outer","inner"])).toThrow("locked");
  });
});
