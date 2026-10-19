import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { groupPptxSceneShapes } from "@/lib/workspace/pptx-scene-groups";
import { exportBoardPptx } from "@/lib/workspace/pptx-export";

const item=(id:string,groupId?:string)=>({id,kind:"text",x:id==="a"?50:250,y:100,w:160,h:90,rotation:0,text:id,groupId});
describe("PowerPoint native scene groups",()=>{
  it("wraps contiguous members without losing editable child XML",()=>{
    const scene=normalizeSlideScene({version:2,objects:[item("a","g"),item("b","g"),item("c")]})!;
    const output=groupPptxSceneShapes(scene,["<p:sp>A</p:sp>","<p:sp>B</p:sp>","<p:sp>C</p:sp>"],1);
    expect(output).toHaveLength(2);
    expect(output[0]).toContain("<p:grpSp>");
    expect(output[0]).toContain("Group g");
    expect(output[0]).toContain("<p:sp>A</p:sp><p:sp>B</p:sp>");
    expect(output[1]).toBe("<p:sp>C</p:sp>");
    expect(output[0]).toContain("<a:chOff");
  });
  it("keeps disjoint logical groups as separate shapes to preserve stacking",()=>{
    const scene=normalizeSlideScene({version:2,objects:[item("a","g"),item("b"),item("c","g")]})!;
    expect(groupPptxSceneShapes(scene,["one","two","three"],1)).toEqual(["one","two","three"]);
  });
  it("rejects malformed XML shape counts rather than corrupting export",()=>{
    const scene=normalizeSlideScene({version:2,objects:[item("a")]})!;
    expect(()=>groupPptxSceneShapes(scene,[],1)).toThrow("mismatch");
  });
  it("writes editable grouped text into an OOXML presentation",async()=>{
    const scene=normalizeSlideScene({version:2,objects:[item("a","g"),item("b","g"),item("c")]})!;
    const board={title:"Grouped",blocks:{deck:{type:"slideDeck",data:{slideOrder:["s1"],slides:{s1:{id:"s1",name:"Group",html:"",scene}}}}},blockOrder:["deck"]};
    const result=await exportBoardPptx(board,["deck"],async()=>null);
    const zip=await JSZip.loadAsync(result.buffer);
    const slide=await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain('name="Group g"');
    expect(slide).toContain("<p:grpSp>");
    expect(slide).toContain('name="Text 2"');
    expect(slide).toContain('name="Text 3"');
    expect(slide).toContain('name="Text 4"');
  });
});
