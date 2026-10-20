import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneTableLayout } from "@/app/workspace/types/slideSceneTable";
import { sceneTableCellStyle } from "@/app/workspace/utils/slideSceneTableStyle";
import { sceneTableTextObject } from "@/app/workspace/utils/slideSceneTableText";
import { pdfSceneRichText } from "./pdf-scene-text";
import { xml } from "./pptx-elements";
/** Parent scene group supplies authored rotation/opacity; rich cell content shares box typography. */
export function pdfSceneTableSvg(object:SlideSceneObject,prefix:string):string{
  const table=object.table;if(!table)return "";
  return sceneTableLayout(table).map(frame=>{
    const style=sceneTableCellStyle(object,table,frame.row,frame.cell);
    const x=object.x+frame.x*object.w,y=object.y+frame.y*object.h,w=frame.w*object.w,h=frame.h*object.h;
    const clip=`${prefix}-cell-${frame.row}-${frame.column}`;
    const box={x:x+style.padding,y:y+style.padding,w:Math.max(1,w-style.padding*2),h:Math.max(0,h-style.padding*2)};
    const text=pdfSceneRichText(sceneTableTextObject(object,table,frame.row,frame.cell,box));
    return `<defs><clipPath id="${xml(clip)}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${xml(style.fill)}" stroke="${xml(style.border)}" stroke-width="1"/><g clip-path="url(#${xml(clip)})">${text}</g>`;
  }).join("");
}
