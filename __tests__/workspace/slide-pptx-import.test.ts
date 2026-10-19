// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { appendImportedSlides, materializePptxImport } from "@/lib/workspace/pptx-import/apply";
import { inspectPptxZip, PptxArchive } from "@/lib/workspace/pptx-import/archive";
import { parseXml, resolvePart } from "@/lib/workspace/pptx-import/xml";
import { exportSceneShape } from "@/lib/workspace/pptx-scene";
import { imageShape, textShape } from "@/lib/workspace/pptx-elements";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";

const read = async () => parsePptx(await pack(await importFixture()),"deck.pptx");
describe("PPTX import and nondestructive application", () => {
  it("reads source order, Unicode text, correct point/pixel size, images, notes and transition", async () => {
    const result = await read(), slide = result.slides[0];
    expect(result.slides).toHaveLength(2);
    const text=slide.scene!.objects.find(o=>o.kind==="text")!;
    expect(text.text).toBe("Title & \u1ebf"); expect(text.x).toBeCloseTo(120); expect(text.fontSize).toBeCloseTo(32);
    expect(slide.backgroundColor?.toLowerCase()).toBe("#102030"); expect(slide.transition).toBe("fade");
    expect(slide.presenterNotes).toContain("Speaker notes preserved");
    const image=slide.scene!.objects.find(o=>o.kind==="image")!;
    expect(image.rotation).toBeCloseTo(30); expect(image.imageFit).toBe("cover"); expect(image.imageFocusY).toBeCloseTo(0.5);
    expect(result.assets).toHaveLength(1); expect(image.src).toBe(result.assets[0].src);
    expect(result.slides[1].scene!.objects.some(o=>o.text==="42")).toBe(true);
    expect(result.notices.some(n=>n.code==="table")).toBe(true);
  });
  it("uses slide relationships, not lexical filenames, for order", async () => {
    const zip=await importFixture(); let xml=await zip.file("ppt/presentation.xml")!.async("string");
    xml=xml.replace('r:id="rId1"','r:id="TEMP"').replace('r:id="rId2"','r:id="rId1"').replace('r:id="TEMP"','r:id="rId2"');
    zip.file("ppt/presentation.xml",xml);
    const result=await parsePptx(await pack(zip),"deck.pptx");
    expect(result.slides[0].scene!.objects.some(o=>o.text==="42")).toBe(true);
  });
  it("retains text size, alignment and opacity when reimporting Scene V2 export primitives", async () => {
    const zip=await importFixture();
    zip.file("ppt/slides/slide1.xml",slideXml(exportSceneShape({id:"t",kind:"text",x:50,y:70,w:400,h:150,rotation:30,text:"Roundtrip",fontSize:48,align:"center",color:"#224466",opacity:0.5},2,1)));
    const text=(await parsePptx(await pack(zip),"deck.pptx")).slides[0].scene!.objects.find(o=>o.kind==="text")!;
    expect(text.fontSize).toBeCloseTo(48); expect(text.rotation).toBeCloseTo(30); expect(text.align).toBe("center"); expect(text.opacity).toBe(0.5);
  });
  it("maps native group child coordinates while keeping members editable", async () => {
    const zip=await importFixture();
    const transform='<p:grpSpPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="3810000" cy="1905000"/><a:chOff x="0" y="0"/><a:chExt cx="1905000" cy="952500"/></a:xfrm></p:grpSpPr>';
    zip.file("ppt/slides/slide1.xml",slideXml(`<p:grpSp>${transform}${textShape(2,"First",0,0,100,100,24,"111111","Arial")}${textShape(3,"Second",100,0,100,100,24,"111111","Arial")}</p:grpSp>`));
    const objects=(await parsePptx(await pack(zip),"deck.pptx")).slides[0].scene!.objects;
    expect(objects[0].x).toBeCloseTo(100); expect(objects[1].x).toBeCloseTo(300); expect(objects[0].w).toBeCloseTo(200);
    expect(objects[0].groupId).toBeTruthy(); expect(objects[1].groupId).toBe(objects[0].groupId);
  });
  it("never fetches external relationships and reports unsupported content", async () => {
    const fetcher=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("must not fetch"));
    try {
      const zip=await importFixture();
      zip.file("ppt/slides/_rels/slide1.xml.rels",`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://external.invalid/image.png" TargetMode="External"/></Relationships>`);
      zip.file("ppt/slides/slide1.xml",slideXml(imageShape(3,"rIdImg","Remote",100,200,400,200),'<p:timing/>'));
      const result=await parsePptx(await pack(zip),"deck.pptx");
      expect(result.assets).toEqual([]); expect(fetcher).not.toHaveBeenCalled();
      expect(result.notices.some(n=>n.code==="external-image")).toBe(true); expect(result.notices.some(n=>n.code==="animation")).toBe(true);
    } finally { fetcher.mockRestore(); }
  });
  it("fits a different ratio uniformly and reports it", async () => {
    const result=await parsePptx(await pack(await importFixture()),"deck.pptx",{aspectRatio:"4:3"});
    const t=result.slides[0].scene!.objects.find(o=>o.kind==="text")!;
    expect(result.slides[0].scene!.height).toBe(960); expect(t.w).toBeCloseTo(700); expect(t.y).toBeCloseTo(200);
    expect(result.notices.some(n=>n.code==="aspect-ratio")).toBe(true);
  });
  it("uploads only on explicit materialization and never mutates the staged result", async () => {
    const result=await read(), upload=vi.fn(async()=>"/api/workspace-images/ws_123abc");
    const slides=await materializePptxImport(result,upload);
    expect(upload).toHaveBeenCalledTimes(1); expect(slides[0].id).not.toBe(result.slides[0].id);
    expect(slides[0].scene!.objects.find(o=>o.kind==="image")!.src).toBe("/api/workspace-images/ws_123abc");
    expect(result.slides[0].scene!.objects.find(o=>o.kind==="image")!.src).toMatch(/^\/__pptx_import_asset\//);
    await expect(materializePptxImport(result,async()=>"https://external.invalid/x")).rejects.toThrow("upload failed");
  });
  it("appends without replacing existing slides, rejects stale revisions, collisions and capacity overflow", async () => {
    const result=await read(), slides=await materializePptxImport(result,async()=>"/api/workspace-images/ws_abc");
    const current={aspectRatio:"16:9" as const,slideOrder:["keep"],slides:{keep:{id:"keep",name:"Keep",html:"original"}}};
    const next=appendImportedSlides(current,JSON.stringify(current),"16:9",slides);
    expect(next.slides.keep).toBe(current.slides.keep); expect(current.slideOrder).toEqual(["keep"]); expect(next.slideOrder).toHaveLength(3);
    expect(()=>appendImportedSlides({...current,title:"Changed"},JSON.stringify(current),"16:9",slides)).toThrow("changed");
    expect(()=>appendImportedSlides(current,JSON.stringify(current),"4:3",slides)).toThrow("ratio");
    expect(()=>appendImportedSlides(current,JSON.stringify(current),"16:9",[{...slides[0],id:"keep"}])).toThrow("Duplicate");
    expect(()=>appendImportedSlides(current,JSON.stringify(current),"16:9",Array(60).fill(slides[0]))).toThrow("60");
  });
});

describe("PPTX import resource and trust boundaries", () => {
  it("rejects invalid files, ZIP traversal and XML entities", async () => {
    expect(()=>inspectPptxZip(new Uint8Array(99))).toThrow();
    await expect(parsePptx(await pack(await importFixture()),"bad.pptm")).rejects.toThrow(".pptx");
    const zip=await importFixture(); zip.file("../escape.txt","no",{createFolders:false});
    await expect(parsePptx(await pack(zip),"bad.pptx")).rejects.toThrow("Unsafe");
    expect(()=>parseXml('<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>',"test")).toThrow("Unsafe");
    expect(()=>resolvePart("ppt/slides/slide1.xml","../../../etc/passwd")).toThrow("escapes");
    expect(()=>resolvePart("ppt/slides/slide1.xml","%2f%2fhost/file")).toThrow("Unsafe");
  });
  it("checks declared expanded size before decompression", async () => {
    const bytes=await pack(await importFixture()), view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const central=view.getUint32(bytes.length-22+16,true); view.setUint32(central+24,16_000_000,true);
    expect(()=>inspectPptxZip(bytes)).toThrow("oversized");
  });
  it("bounds real streamed output when central-directory size lies", async () => {
    const zip=await importFixture();zip.file("bomb.txt","a".repeat(100_000));
    const bytes=await pack(zip),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=view.getUint32(bytes.length-22+16,true);
    while(view.getUint32(at,true)===0x02014b50){const n=view.getUint16(at+28,true), extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);if(new TextDecoder().decode(bytes.subarray(at+46,at+46+n))==="bomb.txt"){view.setUint32(at+24,10,true);break;}at+=46+n+extra+comment;}
    const archive=await PptxArchive.open(bytes); await expect(archive.bytes("bomb.txt")).rejects.toThrow(/limit|length|size/i);
  });
  it("cancels before parsing and after an upload without producing publishable slides", async () => {
    const c=new AbortController();c.abort(); await expect(parsePptx(await pack(await importFixture()),"deck.pptx",{signal:c.signal})).rejects.toThrow();
    const result=await read(),d=new AbortController();
    await expect(materializePptxImport(result,async()=>{d.abort();return "/api/workspace-images/ws_abc";},d.signal)).rejects.toThrow();
  });
  it("refuses object-count overflow rather than dropping content", async () => {
    const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(Array.from({length:121},(_,i)=>textShape(i+2,`Text ${i}`,0,0,50,50,12,"111111","Arial")).join("")));
    await expect(parsePptx(await pack(zip),"large.pptx")).rejects.toThrow("120");
  });
});
