"use client";
import React, { useEffect, useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { normalizeSceneTable, tableMergeAt } from "../../types/slideSceneTable";
import { sceneTableTextObject } from "../../utils/slideSceneTableText";
import { sceneTableCellStyle } from "../../utils/slideSceneTableStyle";
import { SlideSceneRichTextEditor } from "./SlideSceneRichTextEditor";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
const signature=(o:SlideSceneObject)=>JSON.stringify({table:o.table,fontSize:o.fontSize,fontFamily:o.fontFamily,fontWeight:o.fontWeight,align:o.align,fill:o.fill,color:o.color});
type Props={object:SlideSceneObject;readOnly:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void};
export function SlideSceneTableRichTextControls({object,readOnly,onPatch}:Props){
  const [row,setRow]=useState(0),[column,setColumn]=useState(0),[draft,setDraft]=useState<{object:SlideSceneObject;signature:string;row:number;column:number;background:string}|null>(null);
  const [error,setError]=useState("");const table=object.table,disabled=readOnly||!!object.locked;
  useEffect(()=>{if(disabled)setDraft(null);if(table){setRow(r=>Math.min(r,table.rows.length-1));setColumn(c=>Math.min(c,table.rows[0].length-1));}},[disabled,table]);
  if(!table)return null;
  const cell=table.rows[row]?.[column],merge=tableMergeAt(table,row,column),covered=!!merge&&(merge.row!==row||merge.column!==column);
  const begin=()=>{
    if(disabled||!cell)return;
    const text=sceneTableTextObject(object,table,row,cell,{x:0,y:0,w:600,h:300});
    setDraft({object:structuredClone(text),signature:signature(object),row,column,background:sceneTableCellStyle(object,table,row,cell).fill});setError("");
  };
  return <div className="mt-2 space-y-2 rounded border p-2" aria-label="Rich table cell formatting">
    <strong>Format text inside a cell</strong>
    <div className="flex gap-2"><label>Row<select aria-label="Rich cell row" className={field} value={row} disabled={disabled} onChange={e=>setRow(Number(e.target.value))}>{table.rows.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      <label>Column<select aria-label="Rich cell column" className={field} value={column} disabled={disabled} onChange={e=>setColumn(Number(e.target.value))}>{table.rows[0].map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label></div>
    <p className="whitespace-pre-wrap break-words text-slate-500">{cell?.text.slice(0,160)||"Empty cell"}</p>
    {covered&&<p className="text-amber-800">This covered cell becomes visible after unmerging; its formatting is still retained.</p>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <button type="button" className={field+" w-full"} disabled={disabled} onClick={begin}>Format selected cell text</button>
    <p className="text-slate-500">Apply saves one cell-formatting change. Plain text replacement in the grid intentionally clears that cell's mixed formatting.</p>
    {draft&&<SlideSceneRichTextEditor object={draft.object} backgroundColor={draft.background} onCancel={()=>setDraft(null)} onApply={richText=>{
      if(disabled||signature(object)!==draft.signature)return false;
      const rows=table.rows.map((cells,r)=>cells.map((c,col)=>r===draft.row&&col===draft.column?{...c,richText}:c));
      const next=normalizeSceneTable({...table,rows});
      if(!next){setError("Cell rich text exceeds supported text, run or paragraph limits.");return false;}
      onPatch({table:next});setDraft(null);setError("");return true;
    }}/>}
  </div>;
}
