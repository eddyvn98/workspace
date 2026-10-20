import { describe, expect, it } from "vitest";
import { emptySlideScene, normalizeSlideScene, sceneDeleteObject, sceneMoveObject, scenePatchObject } from "@/app/workspace/types/slideScene";
import { buildDeckSlides } from "@/app/api/workspaces/[id]/agent/slideDeckCreate";
import { boardExportSlides } from "@/lib/workspace/slide-export-scene";
import { exportSceneShape } from "@/lib/workspace/pptx-scene";

const item = { id:"title", kind:"text", x:100, y:90, w:900, h:100, rotation:0, text:"AI presentation", fontSize:56 };

describe("Slide Scene V2", () => {
  it("accepts a valid freeform scene and normalizes dimensions", () => {
    const scene = normalizeSlideScene({ version:2, objects:[item] });
    expect(scene?.objects[0].text).toBe("AI presentation");
    expect(scene?.width).toBe(1280);
    expect(scene?.height).toBe(720);
    expect(emptySlideScene("4:3").height).toBe(960);
  });
  it("rejects malicious image URLs and duplicate object ids", () => {
    expect(normalizeSlideScene({ version:2, objects:[{ ...item, kind:"image", src:"javascript:alert(1)" }] })).toBeUndefined();
    expect(normalizeSlideScene({ version:2, objects:[item,item] })).toBeUndefined();
  });
  it("supports geometry edits, reordering and deletion without affecting other objects", () => {
    const scene = normalizeSlideScene({ version:2, objects:[item,{...item,id:"second",kind:"shape"}] })!;
    const moved = scenePatchObject(scene,"title",{x:300});
    expect(moved.objects[0].x).toBe(300);
    expect(scene.objects[0].x).toBe(100);
    expect(sceneMoveObject(moved,"title",1).objects[1].id).toBe("title");
    expect(sceneDeleteObject(moved,"title").objects).toHaveLength(1);
  });
  it("lets AI create slides with a V2 scene and no legacy HTML", () => {
    const notes:string[]=[];
    const built = buildDeckSlides([{name:"Intro",scene:{version:2,objects:[item]}}],notes);
    expect(built.ok).toBe(true);
    if (built.ok) expect((built.slides[0].scene as {objects:unknown[]}).objects).toHaveLength(1);
  });
  it("uses scene objects, not fallback HTML, when preparing slide export", () => {
    const scene = normalizeSlideScene({version:2,objects:[item]})!;
    const block={type:"slideDeck",data:{slideOrder:["s1"],slides:{s1:{id:"s1",name:"Intro",html:"<h1>Old</h1>",scene}}}};
    const board={blocks:{"block-1":block},blockOrder:["block-1"]};
    const slides=boardExportSlides(board);
    expect(slides).toHaveLength(1);
    expect(slides[0].elements).toHaveLength(0);
  });
  it("exports editable PowerPoint geometry", () => {
    const output = exportSceneShape(normalizeSlideScene({version:2,objects:[item]})!.objects[0],2,1);
    expect(output).toContain("AI presentation");
    expect(output).toContain('name="Text 2"');
  });
});
