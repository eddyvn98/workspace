import type { SlideSceneObject } from "../types/slideScene";
import type { SceneTableCell, SceneTableData } from "../types/slideSceneTable";
export function sceneTableCellStyle(object:Pick<SlideSceneObject,"fill"|"color"|"fontSize"|"fontFamily"|"fontWeight"|"align"|"stroke">,table:SceneTableData,row:number,cell:SceneTableCell){
  const header=table.headerRow&&row===0;
  const accent=object.fill&&object.fill!=="transparent"?object.fill:"#2563eb";
  return {
    fill:cell.fill??(header?accent:"#ffffff"),
    color:cell.color??(header?"#ffffff":object.color??"#0f172a"),
    fontSize:cell.fontSize??object.fontSize??22,
    fontFamily:cell.fontFamily??object.fontFamily??"Arial",
    bold:cell.bold??(header||object.fontWeight==="bold"),italic:cell.italic??false,underline:cell.underline??false,
    align:cell.align??object.align??"left",verticalAlign:cell.verticalAlign??"middle",
    border:object.stroke&&object.stroke!=="transparent"?object.stroke:"#cbd5e1",
    padding:8,lineHeight:1.15,
  } as const;
}
