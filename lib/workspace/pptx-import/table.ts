import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { normalizeSceneTable, SCENE_TABLE_LIMITS, tableMergeAt, type SceneTableCell, type SceneTableMerge } from "@/app/workspace/types/slideSceneTable";
import { child, children, first, numeric, NS } from "./xml";
import { frame, type Matrix } from "./geometry";
import { paint, opacity, readText } from "./style";
import type { ObjectContext } from "./objects";
const truth=(node:Element|undefined,name:string)=>["1","true"].includes(node?.getAttribute(name)||"");
function paintAlpha(node:Element|undefined,ctx:ObjectContext,fallback:string):string{
  const color=paint(node,ctx.theme,fallback),alpha=opacity(node);
  return /^#[0-9a-f]{6}$/i.test(color)&&alpha<1?color+Math.round(alpha*255).toString(16).padStart(2,"0"):color;
}
/** Keep the native grid and every cell's rich content, including covered merged-cell values. */
export function readNativeTable(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):SlideSceneObject{
  const widths=children(child(node,NS.a,"tblGrid"),NS.a,"gridCol").map(c=>numeric(c,"w"));
  const rows=children(node,NS.a,"tr"),heights=rows.map(r=>numeric(r,"h"));
  if(!widths.length||widths.length>SCENE_TABLE_LIMITS.columns||!rows.length||rows.length>SCENE_TABLE_LIMITS.rows||[...widths,...heights].some(v=>v<=0))throw new Error("Imported table exceeds 30 rows / 15 columns or has invalid dimensions.");
  const grid=rows.map(row=>children(row,NS.a,"tc"));
  if(grid.some(cells=>cells.length!==widths.length))throw new Error("Unsupported PowerPoint table grid: every row must include the covered cells of merged regions.");
  const totalWidth=widths.reduce((a,b)=>a+b,0),fontScale=Math.hypot(matrix[0],matrix[1])/totalWidth;
  const merged:SceneTableMerge[]=[],borderColors=new Set<string>();
  if(child(child(node,NS.a,"tblPr"),NS.a,"tableStyleId"))ctx.notice("table-style","Native cell values and rich text were imported; theme table-style inheritance may differ where cells have no explicit style.");
  const data=grid.map((cells,r)=>cells.map((source,c):SceneTableCell=>{
    const rowSpan=numeric(source,"rowSpan",1),colSpan=numeric(source,"gridSpan",1),hMerge=truth(source,"hMerge"),vMerge=truth(source,"vMerge");
    if(!Number.isInteger(rowSpan)||!Number.isInteger(colSpan)||rowSpan<1||colSpan<1)throw new Error("Invalid table merge spans.");
    if(!hMerge&&!vMerge&&(rowSpan>1||colSpan>1))merged.push({row:r,column:c,rowSpan,colSpan});
    const body=child(source,NS.a,"txBody"),props=child(source,NS.a,"tcPr");
    const result:SceneTableCell={text:""};
    if(body){
      const text=readText(body,ctx.theme,fontScale,ctx.notice);
      result.text=text.text??"";
      if(result.text.length>SCENE_TABLE_LIMITS.cellText)throw new Error("Imported table cell exceeds 2,000 characters.");
      if(text.richText)result.richText=text.richText;
      result.fontSize=Math.min(120,text.fontSize??22);result.fontFamily=text.fontFamily??ctx.theme.minorFont;
      result.bold=text.fontWeight==="bold";result.italic=text.italic??false;result.underline=text.underline??false;result.strike=text.strike??false;
      result.align=text.align??"left";result.color=text.color??"#0f172a";
      if(first(body,NS.a,"hlinkClick"))ctx.notice("table-link","Table hyperlinks remain inert text, not activated actions.");
    }
    result.fill=paintAlpha(props,ctx,"#ffffff");
    const anchor=props?.getAttribute("anchor")??child(body,NS.a,"bodyPr")?.getAttribute("anchor");
    result.verticalAlign=anchor==="b"?"bottom":anchor==="ctr"?"middle":"top";
    if(props?.getAttribute("vert")&&props.getAttribute("vert")!=="horz")ctx.notice("table-text-direction","Vertical table text was imported as horizontal text.");
    for(const side of ["lnL","lnR","lnT","lnB"]){
      const line=child(props,NS.a,side);if(!line)continue;
      borderColors.add(paintAlpha(line,ctx,"#cbd5e1"));
      if(Math.abs(numeric(line,"w",9525)*fontScale-1)>0.5||child(line,NS.a,"prstDash")?.getAttribute("val")&&child(line,NS.a,"prstDash")?.getAttribute("val")!=="solid")ctx.notice("table-border","Custom table border widths or dash patterns use the standard one-pixel solid grid after import.");
    }
    if(first(props,NS.a,"gradFill")||first(props,NS.a,"blipFill"))ctx.notice("table-fill","A complex table-cell fill was converted to a solid fill.");
    for(const margin of ["marL","marR","marT","marB"])if(props?.hasAttribute(margin)&&Math.abs(numeric(props,margin)*fontScale-8)>1)ctx.notice("table-padding","Custom cell margins were normalized to 8 scene pixels.");
    return result;
  }));
  const table=normalizeSceneTable({rows:data,columnWidths:widths,rowHeights:heights,merges:merged,headerRow:truth(child(node,NS.a,"tblPr"),"firstRow")});
  if(!table)throw new Error("Ambiguous PowerPoint merged-cell flags or excessive cell text/formatting. Simplify and re-save this table before import.");
  grid.forEach((cells,r)=>cells.forEach((source,c)=>{
    const merge=tableMergeAt(table,r,c),expectedH=!!merge&&c>merge.column,expectedV=!!merge&&r>merge.row;
    if(truth(source,"hMerge")!==expectedH||truth(source,"vMerge")!==expectedV)throw new Error("Ambiguous PowerPoint merged-cell flags. Unmerge and re-save this table before import.");
    const expectedRows=merge&&r===merge.row?merge.rowSpan:1,expectedCols=merge&&c===merge.column?merge.colSpan:1;
    if(numeric(source,"rowSpan",1)!==expectedRows||numeric(source,"gridSpan",1)!==expectedCols)ctx.notice("table-merge-spans","Merge spans were normalized from the top-left cell; inspect the table after import.");
  }));
  if(borderColors.size>1)ctx.notice("table-border","Different cell border colors were normalized to one editable table grid color.");
  return {id:ctx.nextId(),kind:"table",...frame(matrix,ctx.notice),table,fontSize:22,fontFamily:ctx.theme.minorFont,color:"#0f172a",fill:ctx.theme.colors.accent1??"#2563eb",stroke:[...borderColors][0]??"#cbd5e1",groupId};
}
