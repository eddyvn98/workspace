"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneTableLayout } from "../../types/slideSceneTable";
import { sceneTableCellStyle } from "../../utils/slideSceneTableStyle";
import { sceneTableTextObject } from "../../utils/slideSceneTableText";
import { SlideSceneTextView } from "./SlideSceneTextView";
export function SlideSceneTableView({object,sceneWidth}:{object:SlideSceneObject;sceneWidth:number}){
  const table=object.table;if(!table)return null;
  const cells=sceneTableLayout(table),unit=100/sceneWidth;
  return <div className="relative h-full w-full" role="table" aria-label="Slide table" aria-rowcount={table.rows.length} aria-colcount={table.rows[0].length}>
    {table.rows.map((_,row)=><div role="row" aria-rowindex={row+1} key={row}>
      {cells.filter(cell=>cell.row===row).map(frame=>{
        const style=sceneTableCellStyle(object,table,frame.row,frame.cell);
        const textObject=sceneTableTextObject(object,table,frame.row,frame.cell);
        return <div role={table.headerRow&&row===0?"columnheader":"cell"} aria-colindex={frame.column+1} aria-colspan={frame.colSpan} aria-rowspan={frame.rowSpan}
          data-table-cell={`${frame.row}:${frame.column}`} key={`${frame.row}:${frame.column}`}
          style={{position:"absolute",boxSizing:"border-box",left:`${frame.x*100}%`,top:`${frame.y*100}%`,width:`${frame.w*100}%`,height:`${frame.h*100}%`,
            padding:`${style.padding*unit}cqw`,background:style.fill,color:style.color,border:`${unit}cqw solid ${style.border}`,overflow:"hidden"}}>
          <SlideSceneTextView object={textObject} sceneWidth={sceneWidth}/>
        </div>;
      })}
    </div>)}
  </div>;
}
