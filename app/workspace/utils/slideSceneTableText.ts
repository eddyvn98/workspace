import type { SlideSceneObject } from "../types/slideScene";
import type { SceneTableCell, SceneTableData } from "../types/slideSceneTable";
import { inheritSceneTextStyle, richTextFromObject, type SceneTextDefaults } from "../types/slideSceneText";
import { sceneTableCellStyle } from "./slideSceneTableStyle";
export function patchSceneTableCell(cell:SceneTableCell,patch:Partial<SceneTableCell>):SceneTableCell{
  const next={...cell,...patch};
  if(cell.richText&&!Object.hasOwn(patch,"richText")){
    if(Object.hasOwn(patch,"text")&&patch.text!==cell.text)delete next.richText;
    else{
      const mapped:Partial<SceneTextDefaults>={};
      for(const key of ["fontSize","fontFamily","color","italic","underline","strike","align"] as const)if(Object.hasOwn(patch,key))Object.assign(mapped,{[key]:patch[key]});
      if(Object.hasOwn(patch,"bold"))mapped.fontWeight=patch.bold?"bold":"normal";
      next.richText=inheritSceneTextStyle(cell.richText,mapped);
    }
  }
  return next;
}
/** A cell is rendered with the same rich text engine as a text box, inside its existing grid frame. */
export function sceneTableTextObject(object:SlideSceneObject,table:SceneTableData,row:number,cell:SceneTableCell,box={x:0,y:0,w:object.w,h:object.h}):SlideSceneObject{
  const style=sceneTableCellStyle(object,table,row,cell);
  const richText=cell.richText??{version:1 as const,paragraphs:richTextFromObject(cell).paragraphs.map(p=>({...p,lineHeight:style.lineHeight}))};
  return {id:`${object.id}-cell`,kind:"text",...box,rotation:0,text:cell.text,richText,
    fontSize:style.fontSize,fontFamily:style.fontFamily,fontWeight:style.bold?"bold":"normal",italic:style.italic,underline:style.underline,strike:cell.strike??false,
    align:style.align,verticalAlign:style.verticalAlign,color:style.color,opacity:1};
}
