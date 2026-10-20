// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { normalizeSlideScene, sceneObject } from "@/app/workspace/types/slideScene";
import { normalizeSceneTable } from "@/app/workspace/types/slideSceneTable";
import { exportBoardPptx } from "@/lib/workspace/pptx-export";
import { exportBoardPdf } from "@/lib/workspace/pdf-export";
import { slideScenePdfSvg } from "@/lib/workspace/pdf-scene";
import { tableExportMeasures } from "@/lib/workspace/pptx-scene-table";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { parseXml, NS } from "@/lib/workspace/pptx-import/xml";
import { compileSceneTimeline } from "@/app/workspace/utils/slideScenePlayback";
const data=()=>normalizeSceneTable({
  rows:[[{text:"Tiêu đề & dữ liệu",bold:true,italic:true,underline:true,align:"center",verticalAlign:"middle",fontSize:32,color:"#abcdef",fill:"#123456"},{text:"Covered B"},{text:"C"}],
    [{text:"Covered D"},{text:"Covered E"},{text:"F",align:"right",verticalAlign:"bottom"}],
    [{text:"G"},{text:"H"},{text:"=1+1"}]],
  columnWidths:[1,2,1],rowHeights:[1,1,2],merges:[{row:0,column:0,rowSpan:2,colSpan:2}],headerRow:true,
})!;
const scene=(ratio:"16:9"|"4:3"="16:9")=>normalizeSlideScene({version:2,objects:[{...sceneObject("table"),id:"native-table",x:80,y:100,w:900,h:400,rotation:12,table:data(),animations:[{kind:"fade",phase:"entrance",trigger:"on-click",durationMs:500,delayMs:0,order:0},{kind:"fade",phase:"exit",trigger:"on-click",durationMs:300,delayMs:0,order:1}]}]},ratio)!;
const board=(ratio:"16:9"|"4:3"="16:9")=>({title:"Native table",blocks:{d:{type:"slideDeck",data:{aspectRatio:ratio,slideOrder:["s"],slides:{s:{id:"s",name:"Table",html:"",scene:scene(ratio)}}}}},blockOrder:["d"]});
describe("Native slide table files",()=>{
  it.each(["16:9","4:3"] as const)("round-trips editable cells and merged table geometry for %s",async ratio=>{
    const out=await exportBoardPptx(board(ratio),["d"],async()=>null),zip=await JSZip.loadAsync(out.buffer);
    const text=await zip.file("ppt/slides/slide1.xml")!.async("string"),xml=parseXml(text,"slide");
    expect(xml.getElementsByTagNameNS(NS.a,"tbl")).toHaveLength(1);
    const cells=Array.from(xml.getElementsByTagNameNS(NS.a,"tc"));expect(cells).toHaveLength(9);
    expect(cells[0].getAttribute("gridSpan")).toBe("2");expect(cells[0].getAttribute("rowSpan")).toBe("2");
    expect(cells[1].getAttribute("hMerge")).toBe("1");expect(cells[1].getAttribute("rowSpan")).toBe("2");
    expect(cells[3].getAttribute("vMerge")).toBe("1");expect(cells[3].getAttribute("gridSpan")).toBe("2");
    expect(cells[4].getAttribute("hMerge")).toBe("1");expect(cells[4].getAttribute("vMerge")).toBe("1");
    expect(text).toContain("Covered E");expect(text).toContain("<p:timing>");
    const imported=await parsePptx(new Uint8Array(out.buffer),"native-table.pptx");
    const objects=imported.slides[0].scene!.objects;
    expect(objects).toHaveLength(1);expect(objects[0].kind).toBe("table");
    expect(objects[0].table!.rows.map(row=>row.map(cell=>cell.text))).toEqual(data().rows.map(row=>row.map(cell=>cell.text)));
    expect(objects[0].table!.merges).toEqual(data().merges);
    expect(objects[0].table!.rows[0][0]).toMatchObject({bold:true,italic:true,underline:true,align:"center",verticalAlign:"middle",color:"#abcdef",fill:"#123456"});
    expect(objects[0].table!.rows[0][0].fontSize).toBeCloseTo(32,1);
    expect(objects[0].x).toBeCloseTo(80,2);expect(objects[0].rotation).toBeCloseTo(12,2);
    const widths=objects[0].table!.columnWidths,sum=widths.reduce((a,b)=>a+b,0);
    expect(widths[0]/sum).toBeCloseTo(0.25,5);expect(widths[1]/sum).toBeCloseTo(0.5,5);
    expect(compileSceneTimeline(objects).cues.map(c=>c.phase)).toEqual(["entrance","exit"]);
    expect(imported.notices.some(n=>n.code==="table")).toBe(false);
  });
  it("renders only merged origins in PDF while preserving full data for editable files",async()=>{
    const s=scene();const svg=await slideScenePdfSvg(s,1280,async()=>{throw new Error("No images expected");});
    expect(svg).toContain("Tiêu đề &amp; dữ liệu");expect(svg).not.toContain("Covered E");expect(svg).toContain("font-style=\"italic\"");
    const pdf=await exportBoardPdf(board(),["d"],async()=>null);expect(pdf.buffer.subarray(0,4).toString()).toBe("%PDF");expect(pdf.slideCount).toBe(1);
  });
  it("exports extreme weights as positive rows/columns with an exact total",()=>{
    const widths=tableExportMeasures([1e12,1e-9,1e-9],76200);
    expect(widths.every(w=>Number.isInteger(w)&&w>0)).toBe(true);expect(widths.reduce((a,b)=>a+b,0)).toBe(76200);
    expect(()=>tableExportMeasures([1,1],1)).toThrow();
  });
  it("rejects ambiguous merged-cell flags instead of silently dropping values",async()=>{
    const out=await exportBoardPptx(board(),["d"],async()=>null),zip=await JSZip.loadAsync(out.buffer);
    const original=await zip.file("ppt/slides/slide1.xml")!.async("string");
    zip.file("ppt/slides/slide1.xml",original.replace(' hMerge="1"',""));
    const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
    await expect(parsePptx(bytes,"broken-table.pptx")).rejects.toThrow("merged-cell flags");
  });
});
