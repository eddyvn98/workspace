import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneTableLayout } from "@/app/workspace/types/slideSceneTable";
import { sceneTableCellStyle } from "@/app/workspace/utils/slideSceneTableStyle";
import { wrapExportText } from "./slide-export-layout";
import { xml } from "./pptx-elements";
/** Parent scene group supplies authored rotation/opacity; cell geometry matches the canvas. */
export function pdfSceneTableSvg(object:SlideSceneObject,prefix:string):string{
  const table=object.table;if(!table)return "";
  return sceneTableLayout(table).map(frame=>{
    const style=sceneTableCellStyle(object,table,frame.row,frame.cell);
    const x=object.x+frame.x*object.w,y=object.y+frame.y*object.h,w=frame.w*object.w,h=frame.h*object.h;
    const clip=`${prefix}-cell-${frame.row}-${frame.column}`;
    const contentWidth=Math.max(1,w-style.padding*2),contentHeight=Math.max(0,h-style.padding*2);
    const lines=wrapExportText(frame.cell.text,Math.max(1,Math.floor(contentWidth/(style.fontSize*0.55))));
    const lineHeight=style.fontSize*style.lineHeight,totalHeight=Math.max(1,lines.length)*lineHeight;
    const top=y+style.padding+(style.verticalAlign==="bottom"?Math.max(0,contentHeight-totalHeight):style.verticalAlign==="middle"?Math.max(0,(contentHeight-totalHeight)/2):0);
    const textX=style.align==="center"?x+w/2:style.align==="right"?x+w-style.padding:x+style.padding;
    const anchor=style.align==="center"?"middle":style.align==="right"?"end":"start";
    const text=`<text fill="${xml(style.color)}" font-family="${xml(style.fontFamily)}" font-size="${style.fontSize}" font-weight="${style.bold?"bold":"normal"}" font-style="${style.italic?"italic":"normal"}" text-decoration="${style.underline?"underline":"none"}" text-anchor="${anchor}">${lines.map((line,index)=>`<tspan x="${textX}" y="${top+style.fontSize+index*lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
    return `<defs><clipPath id="${xml(clip)}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${xml(style.fill)}" stroke="${xml(style.border)}" stroke-width="1"/><g clip-path="url(#${xml(clip)})">${text}</g>`;
  }).join("");
}
