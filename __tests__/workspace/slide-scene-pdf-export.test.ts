import { describe, expect, it, vi } from "vitest";
import { exportBoardPdf } from "@/lib/workspace/pdf-export";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";

const scene=normalizeSlideScene({version:2,objects:[
  {id:"heading",kind:"text",x:100,y:100,w:900,h:110,rotation:0,text:"Visible scene content",fontSize:52,color:"#1f2937"},
  {id:"shape",kind:"shape",x:80,y:250,w:400,h:160,rotation:0,fill:"#2563eb"},
  {id:"chart",kind:"chart",x:500,y:260,w:500,h:360,rotation:0,fill:"#10b981",series:[{label:"East",value:10},{label:"West",value:20}]},
]})!;
const board={blocks:{d:{type:"slideDeck",data:{slideOrder:["s"],slides:{s:{id:"s",name:"V2",html:"",scene}}}}},blockOrder:["d"]};
describe("Scene V2 PDF export",()=>{
  it("renders nonempty scene objects and uses the requested page ratio",async()=>{
    const out=await exportBoardPdf(board,["d"],async()=>null);
    expect(out.slideCount).toBe(1);
    expect(out.buffer.toString("latin1")).toContain("/Count 1");
    expect(out.buffer.toString("latin1")).toContain("/MediaBox [0 0 960 540]");
    expect(out.buffer.length).toBeGreaterThan(1000);
  });
  it("does not contact external URLs for scene images",async()=>{
    const withImage=normalizeSlideScene({version:2,objects:[{id:"image",kind:"image",x:10,y:10,w:300,h:200,rotation:0,src:"https://example.com/x.png"}]})!;
    const boardWithImage={blocks:{d:{type:"slideDeck",data:{slideOrder:["s"],slides:{s:{id:"s",name:"V2",html:"",scene:withImage}}}}},blockOrder:["d"]};
    const reader=vi.fn();
    await expect(exportBoardPdf(boardWithImage,["d"],reader)).rejects.toThrow("uploaded");
    expect(reader).not.toHaveBeenCalled();
  });
});
