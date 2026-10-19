import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {normalizeSlideScene} from "@/app/workspace/types/slideScene";
import {exportBoardPptx} from "@/lib/workspace/pptx-export";

describe("Scene V2 PowerPoint geometry",()=>{
  it("exports 4:3 scene with editable positioned objects and actual 4:3 page size",async()=>{
    const scene=normalizeSlideScene({version:2,objects:[
      {id:"heading",kind:"text",x:100,y:130,w:800,h:100,rotation:25,text:"Scene headline",fontSize:50,color:"#1F2937"},
      {id:"shape",kind:"shape",x:250,y:480,w:500,h:250,rotation:15,fill:"#2563EB"}
    ]},"4:3")!;
    const b={title:"Four three",blocks:{deck:{type:"slideDeck",data:{aspectRatio:"4:3",slideOrder:["s"],slides:{s:{id:"s",name:"Editable",html:"",scene}}}}},blockOrder:["deck"]};
    const out=await exportBoardPptx(b,["deck"],async()=>null);
    const zip=await JSZip.loadAsync(out.buffer);
    const slide=await zip.file("ppt/slides/slide1.xml")!.async("string");
    const presentation=await zip.file("ppt/presentation.xml")!.async("string");
    expect(slide).toContain("Scene headline");
    expect(slide).toContain('rot="1500000"');
    expect(slide).toContain("Shape shape");
    expect(presentation).toContain('cx="9144000" cy="6858000"');
  });
});
