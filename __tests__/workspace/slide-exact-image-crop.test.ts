// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EMPTY_IMAGE_INSETS, exactSceneImagePlacement, imageInsetsXmlValues, normalizeSceneImageInsets } from "@/app/workspace/types/slideSceneImageCrop";
import { normalizeSlideScene, scenePatchObject } from "@/app/workspace/types/slideScene";
import { exportScenePicture } from "@/lib/workspace/pptx-scene-paint";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const crop={left:0.1,top:0.2,right:0.3,bottom:0.1},viewport={left:0.05,top:0.1,right:0.15,bottom:0.2};
const picture={id:"photo",kind:"image" as const,x:100,y:150,w:400,h:200,rotation:30,src:"/api/workspace-images/ws_abc",imageCrop:crop,imageViewport:viewport,opacity:0.75};
describe("Exact image crop",()=>{
  it("keeps destination position and source coordinates independently",()=>{
    const out=exactSceneImagePlacement({x:100,y:150,w:400,h:200},crop,viewport);
    expect(out.clip.x).toBeCloseTo(120);expect(out.clip.y).toBeCloseTo(170);
    expect(out.clip.w).toBeCloseTo(320);expect(out.clip.h).toBeCloseTo(140);
    expect(out.image.w).toBeCloseTo(320/0.6);expect(out.image.h).toBeCloseTo(200);
    expect(out.image.x+out.image.w*crop.left).toBeCloseTo(out.clip.x);
    expect(out.image.y+out.image.h*crop.top).toBeCloseTo(out.clip.y);
    expect(out.image.x+out.image.w*(1-crop.right)).toBeCloseTo(out.clip.x+out.clip.w);
  });
  it("accepts zero insets and rejects invalid or unbounded magnification",()=>{
    expect(normalizeSceneImageInsets(EMPTY_IMAGE_INSETS)).toEqual(EMPTY_IMAGE_INSETS);
    for(const bad of [null,{},[0,0,0,0],{...crop,left:NaN},{...crop,left:-0.1},{...crop,left:"0.1"},{...crop,right:0.9}])expect(normalizeSceneImageInsets(bad)).toBeUndefined();
    expect(()=>exactSceneImagePlacement({x:0,y:0,w:0,h:1})).toThrow();
    expect(imageInsetsXmlValues(crop)).toEqual({l:10000,t:20000,r:30000,b:10000});
  });
  it("retains crop through scene normalization and clearing returns to automatic fit",()=>{
    const scene=normalizeSlideScene({version:2,objects:[picture]})!;
    expect(scene.objects[0].imageCrop).toEqual(crop);
    const moved=scenePatchObject(scene,"photo",{x:220});expect(moved.objects[0].imageCrop).toEqual(crop);
    const automatic=scenePatchObject(moved,"photo",{imageCrop:undefined,imageViewport:undefined,imageFit:"contain"});
    expect(automatic.objects[0].imageCrop).toBeUndefined();expect(automatic.objects[0].imageViewport).toBeUndefined();
    expect(normalizeSlideScene({version:2,objects:[{...picture,kind:"shape"}]})).toBeUndefined();
  });
  it("writes native crop and padding while retaining the rotated outer frame",()=>{
    const xml=exportScenePicture(picture,2,"rIdImg",{width:1200,height:900},1);
    expect(xml).toContain('<a:srcRect l="10000" t="20000" r="30000" b="10000"/>');
    expect(xml).toContain('<a:fillRect l="5000" t="10000" r="15000" b="20000"/>');
    expect(xml).toContain('rot="1800000"');expect(xml).toContain('<a:alphaModFix amt="75000"/>');
  });
  it("imports and reexports a two-axis crop without a lossy cover notice",async()=>{
    const zip=await importFixture();zip.file("ppt/slides/slide1.xml",slideXml(exportScenePicture(picture,2,"rIdImg",{width:1,height:1},1)));
    const result=await parsePptx(await pack(zip),"crop.pptx"),object=result.slides[0].scene!.objects.find(o=>o.kind==="image")!;
    expect(object.imageCrop).toEqual(crop);expect(object.imageViewport).toEqual(viewport);
    expect(object.rotation).toBeCloseTo(30);expect(object.opacity).toBeCloseTo(0.75);
    expect(result.notices.filter(n=>n.code==="image-crop"||n.code==="image-placement")).toEqual([]);
    const output=exportScenePicture(object,2,"rIdImg",{width:1,height:1},1);
    expect(output).toContain('<a:srcRect l="10000" t="20000" r="30000" b="10000"/>');
  });
  it("supports percentage literals and reports outsets rather than accepting invalid geometry",async()=>{
    const zip=await importFixture(),xml=exportScenePicture(picture,2,"rIdImg",{width:1,height:1},1);
    zip.file("ppt/slides/slide1.xml",slideXml(xml.replace('l="10000"','l="10%"')));
    expect((await parsePptx(await pack(zip),"crop.pptx")).slides[0].scene!.objects.find(o=>o.kind==="image")!.imageCrop).toEqual(crop);
    zip.file("ppt/slides/slide1.xml",slideXml(xml.replace('l="10000"','l="-10000"')));
    const invalid=await parsePptx(await pack(zip),"crop.pptx");expect(invalid.notices.some(n=>n.code==="image-crop")).toBe(true);
  });
});
