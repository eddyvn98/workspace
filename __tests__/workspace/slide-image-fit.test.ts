import { describe, expect, it } from "vitest";
import { sceneImageLayout, sceneImageRenderRect } from "@/lib/workspace/slide-image-layout";
import { imageShape } from "@/lib/workspace/pptx-elements";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";

const rect={x:100,y:150,w:400,h:200};
describe("Slide image fit parity",()=>{
  it("supports pixel-exact cover crop in editable PowerPoint",()=>{
    const layout=sceneImageLayout(rect,{width:800,height:800},"cover");
    expect(layout.rect).toEqual(rect);
    expect(layout.crop).toEqual({l:0,r:0,t:25000,b:25000});
    const xml=imageShape(2,"rId3","Photo",rect.x,rect.y,rect.w,rect.h,layout.crop);
    expect(xml).toContain('<a:srcRect l="0" r="0" t="25000" b="25000"/>');
  });
  it("crops horizontal images symmetrically",()=>{
    expect(sceneImageLayout(rect,{width:1600,height:400},"cover").crop).toEqual({l:25000,r:25000,t:0,b:0});
  });
  it("scales contain without distorting aspect ratio",()=>{
    const layout=sceneImageLayout(rect,{width:100,height:100},"contain");
    expect(layout.rect).toEqual({x:200,y:150,w:200,h:200});
    expect(layout.crop).toBeUndefined();
  });
  it("stretches only with fill",()=>{
    expect(sceneImageLayout(rect,{width:123,height:456},"fill")).toEqual({rect});
  });
  it("supports off-centre crop in OOXML and SVG image geometry",()=>{
    const left=sceneImageLayout(rect,{width:1600,height:400},"cover",0,0.5);
    const right=sceneImageLayout(rect,{width:1600,height:400},"cover",1,0.5);
    expect(left.crop).toEqual({l:0,r:50000,t:0,b:0});
    expect(right.crop).toEqual({l:50000,r:0,t:0,b:0});
    expect(sceneImageRenderRect(rect,{width:1600,height:400},"cover",0.75,0.5))
      .toEqual({x:-200,y:150,w:800,h:200});
    expect(sceneImageLayout(rect,{width:100,height:100},"contain",0.25,0.5).rect)
      .toEqual({x:150,y:150,w:200,h:200});
  });
  it("preserves fit while normalizing saved image objects",()=>{
    const raw={version:2,objects:[{id:"photo",kind:"image",x:0,y:0,w:300,h:200,rotation:0,src:"/api/workspace-images/ws_photo",imageFit:"contain"}]};
    expect(normalizeSlideScene(raw)?.objects[0].imageFit).toBe("contain");
  });
});
