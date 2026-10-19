import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { tableMergeAt } from "@/app/workspace/types/slideSceneTable";
import { sceneTableCellStyle } from "@/app/workspace/utils/slideSceneTableStyle";
import { emu, xml } from "./pptx-elements";
import { createTablePaintResolver, tableFillXml } from "./pptx-table-paint";
/** Allocate at least one EMU per row/column and distribute all remaining units without negative tails. */
export function tableExportMeasures(weights:number[],extent:number):number[]{
  if(!weights.length||!Number.isInteger(extent)||extent<weights.length||weights.some(w=>!Number.isFinite(w)||w<=0))throw new Error("Invalid table size weights.");
  const total=weights.reduce((a,b)=>a+b,0),available=extent-weights.length;
  const values=weights.map(w=>1+Math.floor(w/total*available));
  let remainder=extent-values.reduce((a,b)=>a+b,0);
  const priority=weights.map((w,index)=>({index,fraction:w/total*available-Math.floor(w/total*available)})).sort((a,b)=>b.fraction-a.fraction);
  for(let i=0;remainder>0;i++,remainder--)values[priority[i%priority.length].index]+=1;
  return values;
}
/** Each table is one native editable/animatable graphicFrame, including its merged cells. */
export async function exportSceneTable(object:SlideSceneObject,id:number,scale:number):Promise<string>{
  const table=object.table;if(!table)throw new Error("Table scene object is missing its grid data.");
  const widths=tableExportMeasures(table.columnWidths,emu(object.w*scale)),heights=tableExportMeasures(table.rowHeights,emu(object.h*scale));
  const paint=createTablePaintResolver(),opacity=object.opacity??1,rows:string[]=[];
  for(const [r,row] of table.rows.entries()){
    const cells:string[]=[];
    for(const [c,cell] of row.entries()){
      const style=sceneTableCellStyle(object,table,r,cell),merge=tableMergeAt(table,r,c);
      const mergeAttrs=merge?[
        r===merge.row&&merge.rowSpan>1?` rowSpan="${merge.rowSpan}"`:"",c===merge.column&&merge.colSpan>1?` gridSpan="${merge.colSpan}"`:"",
        c>merge.column?' hMerge="1"':"",r>merge.row?' vMerge="1"':"",
      ].join(""):"";
      const [background,foreground,border]=await Promise.all([paint(style.fill),paint(style.color),paint(style.border)]);
      const align=style.align==="center"?"ctr":style.align==="right"?"r":"l",anchor=style.verticalAlign==="top"?"t":style.verticalAlign==="bottom"?"b":"ctr";
      const size=Math.round(style.fontSize*scale*0.75*100),margin=emu(style.padding*scale);
      const runProperties=`<a:rPr lang="vi-VN" sz="${size}" b="${style.bold?1:0}" i="${style.italic?1:0}" u="${style.underline?"sng":"none"}">${tableFillXml(foreground,opacity)}<a:latin typeface="${xml(style.fontFamily)}"/><a:ea typeface="${xml(style.fontFamily)}"/></a:rPr>`;
      const paragraphs=cell.text.split("\n").map(line=>`<a:p><a:pPr algn="${align}"><a:lnSpc><a:spcPct val="115000"/></a:lnSpc></a:pPr><a:r>${runProperties}<a:t xml:space="preserve">${xml(line)}</a:t></a:r><a:endParaRPr lang="vi-VN" sz="${size}"/></a:p>`).join("");
      const borders=["lnL","lnR","lnT","lnB"].map(side=>`<a:${side} w="${emu(scale)}">${tableFillXml(border,opacity)}<a:prstDash val="solid"/></a:${side}>`).join("");
      cells.push(`<a:tc${mergeAttrs}><a:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</a:txBody><a:tcPr marL="${margin}" marR="${margin}" marT="${margin}" marB="${margin}" anchor="${anchor}">${borders}${tableFillXml(background,opacity)}</a:tcPr></a:tc>`);
    }
    rows.push(`<a:tr h="${heights[r]}">${cells.join("")}</a:tr>`);
  }
  const rotation=Math.round(object.rotation*60000);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${xml(object.id)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm${rotation?` rot="${rotation}"`:""}><a:off x="${emu(object.x*scale)}" y="${emu(object.y*scale)}"/><a:ext cx="${emu(object.w*scale)}" cy="${emu(object.h*scale)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${table.headerRow?1:0}" bandRow="0"/><a:tblGrid>${widths.map(w=>`<a:gridCol w="${w}"/>`).join("")}</a:tblGrid>${rows.join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
