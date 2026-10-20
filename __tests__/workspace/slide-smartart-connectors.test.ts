// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { descendSmartArt, MAX_SMARTART_DEPTH } from "@/lib/workspace/pptx-import/diagram-guard";
import { DIAGRAM_NS, DIAGRAM_DRAWING_NS } from "@/lib/workspace/pptx-import/smartart";
import { NS, rels, textShape } from "@/lib/workspace/pptx-elements";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const connector=(id:number,w:number,h:number)=>`<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Link"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="334455"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`;
const graphic=()=>`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="10" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="952500" y="952500"/><a:ext cx="7620000" cy="3810000"/></p:xfrm><a:graphic><a:graphicData uri="${DIAGRAM_NS}"><dgm:relIds xmlns:dgm="${DIAGRAM_NS}" r:dm="rIdData"/></a:graphicData></a:graphic></p:graphicFrame>`;
const data=(cached:boolean)=>`<dgm:dataModel xmlns:dgm="${DIAGRAM_NS}" ${NS} xmlns:dsp="${DIAGRAM_DRAWING_NS}"><dgm:ptLst><dgm:pt modelId="a" type="node"><dgm:t><a:p><a:r><a:t>Plan</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="b" type="node"><dgm:t><a:p><a:r><a:t>Build</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn type="parOf" srcId="a" destId="b"/></dgm:cxnLst>${cached?'<dgm:extLst><a:ext uri="cache"><dsp:dataModelExt relId="rIdDraw"/></a:ext></dgm:extLst>':""}</dgm:dataModel>`;
async function diagramFixture(cached=false,recursive=false){
  const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(graphic()));
  zip.file("ppt/slides/_rels/slide1.xml.rels",rels([{id:"rIdData",type:"diagramData",target:"../diagrams/data1.xml"}]));
  zip.file("ppt/diagrams/data1.xml",data(cached));
  if(cached){
    zip.file("ppt/diagrams/_rels/data1.xml.rels",rels([{id:"rIdDraw",type:"diagramDrawing",target:"drawing1.xml"}]));
    const content=recursive?graphic():textShape(2,"Cached plan",0,0,250,100,20,"111111","Arial")+connector(3,952500,0);
    zip.file("ppt/diagrams/drawing1.xml",`<dsp:drawing xmlns:dsp="${DIAGRAM_DRAWING_NS}" ${NS}><dsp:spTree>${content.replace(/<(\/?)p:/g,"<$1dsp:")}</dsp:spTree></dsp:drawing>`);
    if(recursive)zip.file("ppt/diagrams/_rels/drawing1.xml.rels",rels([{id:"rIdData",type:"diagramData",target:"data1.xml"}]));
  }
  return zip;
}
describe("SmartArt and connector import",()=>{
  it("keeps horizontal and vertical connectors with valid zero extents",async()=>{
    const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(connector(2,1905000,0)+connector(3,0,1905000)));
    const result=await parsePptx(await pack(zip),"links.pptx"),objects=result.slides[0].scene!.objects;
    expect(objects).toHaveLength(2);expect(objects.every(o=>o.kind==="shape"&&o.shapeKind==="line")).toBe(true);
    expect(objects[0].rotation).toBeCloseTo(0);expect(objects[1].rotation).toBeCloseTo(90);
    expect(objects[0].w).toBeCloseTo(200);expect(objects[1].w).toBeCloseTo(200);
  });
  it("imports cached drawing text and connector objects without executing SmartArt layout code",async()=>{
    const result=await parsePptx(await pack(await diagramFixture(true)),"diagram.pptx"),objects=result.slides[0].scene!.objects;
    expect(objects.some(o=>o.kind==="text"&&o.text==="Cached plan")).toBe(true);
    expect(objects.some(o=>o.kind==="shape"&&o.shapeKind==="line")).toBe(true);
    expect(objects.every(o=>!!o.groupId)).toBe(true);expect(result.notices.some(n=>n.code==="smartart-editable")).toBe(true);
  });
  it("retains semantic labels/connections when a cached drawing is missing",async()=>{
    const result=await parsePptx(await pack(await diagramFixture()),"diagram.pptx"),objects=result.slides[0].scene!.objects;
    expect(objects.filter(o=>o.kind==="text").map(o=>o.text)).toEqual(["Plan","Build"]);
    expect(objects.some(o=>o.shapeKind==="line")).toBe(true);expect(result.notices.some(n=>n.code==="smartart-fallback")).toBe(true);
  });
  it("rejects a cached drawing referencing its own ancestor data model",async()=>{
    await expect(parsePptx(await pack(await diagramFixture(true,true)),"cycle.pptx")).rejects.toThrow(/Cyclic SmartArt/);
  });
  it("keeps traversal state immutable and permits reuse on separate branches",()=>{
    const initial=descendSmartArt({},"a.xml"),next=descendSmartArt(initial,"b.xml");
    expect(initial.diagramParts).toEqual(["a.xml"]);expect(next.diagramDepth).toBe(2);
    expect(()=>descendSmartArt(next,"a.xml")).toThrow("Cyclic");
    expect(descendSmartArt(initial,"b.xml").diagramParts).toEqual(["a.xml","b.xml"]);
    expect(()=>descendSmartArt({diagramDepth:MAX_SMARTART_DEPTH},"x.xml")).toThrow("limit");
  });
});
