"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideSceneObject } from "../../types/slideScene";
import { SCENE_TABLE_LIMITS, tableMergeAt, type SceneTableCell, type SceneTableData } from "../../types/slideSceneTable";
import { deleteSceneTableAxis, insertSceneTableAxis, mergeSceneTable, pasteSceneTable, patchSceneTable, setSceneTableWeight, tableRange, unmergeSceneTable } from "../../utils/slideSceneTableOps";
import { SlideSceneTableView } from "./SlideSceneTableView";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
type Point={row:number;column:number};
type Props={object:SlideSceneObject;readOnly:boolean;onApply:(table:SceneTableData)=>void;onClose:()=>void};
function DraftValue({label,value,onSave,disabled,type="text"}:{label:string;value:string|number;onSave:(v:string)=>void;disabled:boolean;type?:"text"|"number"}){
  const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  return <label className="flex items-center justify-between gap-2">{label}<input aria-label={label} className={field+" w-28"} type={type} step="any" value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==String(value))onSave(draft);}} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape")setDraft(String(value));}}/></label>;
}
export function SlideSceneTableEditor({object,readOnly,onApply,onClose}:Props){
  const original=useRef(JSON.stringify(object.table));
  const [draft,setDraft]=useState<SceneTableData>(()=>structuredClone(object.table!));
  const [anchor,setAnchor]=useState<Point>({row:0,column:0}),[active,setActive]=useState<Point>({row:0,column:0});
  const [error,setError]=useState(""),[paste,setPaste]=useState("");
  const past=useRef<SceneTableData[]>([]),future=useRef<SceneTableData[]>([]),dialog=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
  const stale=original.current!==JSON.stringify(object.table),disabled=readOnly||!!object.locked||stale;
  const range=tableRange(anchor,active),cell=draft.rows[active.row]?.[active.column]??draft.rows[0][0];
  const merge=tableMergeAt(draft,active.row,active.column);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return ()=>previous?.focus?.();},[]);
  const keepSelection=(next:SceneTableData)=>{
    const bound=(p:Point)=>({row:Math.min(p.row,next.rows.length-1),column:Math.min(p.column,next.rows[0].length-1)});
    setAnchor(bound);setActive(bound);
  };
  const change=(operation:(table:SceneTableData)=>SceneTableData)=>{
    if(disabled)return;
    try{const next=operation(draft);if(JSON.stringify(next)!==JSON.stringify(draft)){past.current.push(draft);if(past.current.length>40)past.current.shift();future.current=[];setDraft(next);keepSelection(next);}setError("");}
    catch(e){setError(e instanceof Error?e.message:"Unable to change table.");}
  };
  const undo=()=>{if(disabled)return;const next=past.current.pop();if(next){future.current.push(draft);setDraft(next);keepSelection(next);setError("");}};
  const redo=()=>{if(disabled)return;const next=future.current.pop();if(next){past.current.push(draft);setDraft(next);keepSelection(next);setError("");}};
  const select=(point:Point,extend=false)=>{setActive(point);if(!extend)setAnchor(point);};
  const patch=(values:Partial<SceneTableCell>)=>change(table=>patchSceneTable(table,range,values));
  const apply=()=>{if(!disabled){onApply(draft);onClose();}};
  const sizeShare=(axis:"row"|"column",index:number,value:string)=>change(table=>{
    const share=Number(value)/100;if(!value.trim()||!Number.isFinite(share)||share<=0||share>=1)throw new Error("Choose a share greater than 0 and less than 100 percent.");
    const weights=axis==="row"?table.rowHeights:table.columnWidths;
    if(weights.length===1)return table;
    const others=weights.reduce((sum,w,i)=>sum+(i===index?0:w),0);
    return setSceneTableWeight(table,axis,index,others*share/(1-share));
  });
  const pct=(values:number[],index:number)=>Number((100*values[index]/values.reduce((a,b)=>a+b,0)).toFixed(2));
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Edit slide table" className="fixed inset-0 z-[1100] flex flex-col bg-slate-100 p-3 text-slate-900 sm:p-5"
    onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
      e.stopPropagation();
      if(e.key==="Escape"){e.preventDefault();onClose();}
      if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();apply();}
      if(e.key==="Tab"){
        const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')??[]);
        if(e.shiftKey&&document.activeElement===targets[0]){e.preventDefault();targets[targets.length-1]?.focus();}
        else if(!e.shiftKey&&document.activeElement===targets[targets.length-1]){e.preventDefault();targets[0]?.focus();}
      }
    }}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div><h2 className="font-semibold">Edit table</h2><p className="text-xs text-slate-500">{draft.rows.length} rows × {draft.rows[0].length} columns. Apply saves one undoable slide change.</p></div>
      <div className="flex gap-2"><button type="button" className={field} disabled={disabled||!past.current.length} onClick={undo}>Undo table edit</button><button type="button" className={field} disabled={disabled||!future.current.length} onClick={redo}>Redo table edit</button><button ref={close} type="button" className={field} onClick={onClose}>Cancel</button><button type="button" className={field+" border-indigo-500"} disabled={disabled} onClick={apply}>Apply table</button></div>
    </header>
    {stale&&<p role="alert" className="my-2 text-red-700">This table changed outside this dialog. Cancel and reopen it; your draft will not overwrite the newer table.</p>}
    {error&&<p role="alert" className="my-2 text-red-700">{error}</p>}
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap gap-1 text-xs">
          <button type="button" className={field} disabled={disabled||draft.rows.length>=SCENE_TABLE_LIMITS.rows} onClick={()=>change(t=>insertSceneTableAxis(t,"row",active.row))}>Insert row before</button>
          <button type="button" className={field} disabled={disabled||draft.rows.length>=SCENE_TABLE_LIMITS.rows} onClick={()=>change(t=>insertSceneTableAxis(t,"row",active.row+1))}>Insert row after</button>
          <button type="button" className={field} disabled={disabled||draft.rows.length===1} onClick={()=>change(t=>deleteSceneTableAxis(t,"row",active.row))}>Delete row</button>
          <button type="button" className={field} disabled={disabled||draft.rows[0].length>=SCENE_TABLE_LIMITS.columns} onClick={()=>change(t=>insertSceneTableAxis(t,"column",active.column))}>Insert column before</button>
          <button type="button" className={field} disabled={disabled||draft.rows[0].length>=SCENE_TABLE_LIMITS.columns} onClick={()=>change(t=>insertSceneTableAxis(t,"column",active.column+1))}>Insert column after</button>
          <button type="button" className={field} disabled={disabled||draft.rows[0].length===1} onClick={()=>change(t=>deleteSceneTableAxis(t,"column",active.column))}>Delete column</button>
          <button type="button" className={field} disabled={disabled||range.row===range.endRow&&range.column===range.endColumn} onClick={()=>change(t=>mergeSceneTable(t,range))}>Merge selected cells</button>
          <button type="button" className={field} disabled={disabled} onClick={()=>change(t=>unmergeSceneTable(t,range))}>Unmerge selection</button>
        </div>
        <p className="text-xs text-slate-600">Shift-click or Shift+arrows to select a rectangle. Merging shows only the top-left cell; other values remain stored for unmerge.</p>
        <div className="min-h-32 flex-1 overflow-auto rounded border bg-white" onPaste={e=>{if((e.target as Element).closest("input,textarea"))return;e.preventDefault();change(t=>pasteSceneTable(t,active.row,active.column,e.clipboardData.getData("text/plain")));}}>
          <table className="w-full border-collapse text-xs" aria-label="Table data grid"><tbody>{draft.rows.map((row,r)=><tr key={r}>{row.map((value,c)=>{
            const selected=r>=range.row&&r<=range.endRow&&c>=range.column&&c<=range.endColumn;
            const covered=tableMergeAt(draft,r,c),hidden=covered&&(covered.row!==r||covered.column!==c);
            return <td key={c} className="border border-slate-200 p-0"><button type="button" aria-label={`Cell ${r+1}, ${c+1}`} aria-pressed={selected}
              className={`h-full min-h-12 min-w-28 w-full whitespace-pre-wrap break-words px-2 py-2 text-left ${selected?"bg-indigo-100 ring-1 ring-inset ring-indigo-500":"hover:bg-slate-50"}`}
              onClick={e=>select({row:r,column:c},e.shiftKey)} onKeyDown={e=>{
                const moves:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
                const delta=moves[e.key];if(!delta)return;e.preventDefault();
                const next={row:Math.max(0,Math.min(draft.rows.length-1,r+delta[0])),column:Math.max(0,Math.min(row.length-1,c+delta[1]))};select(next,e.shiftKey);
                dialog.current?.querySelector<HTMLElement>(`[aria-label="Cell ${next.row+1}, ${next.column+1}"]`)?.focus();
              }}><span className="block text-[10px] text-slate-400">{r+1}:{c+1}{hidden?" (covered)":""}</span>{value.text||"\u00a0"}</button></td>;
          })}</tr>)}</tbody></table>
        </div>
        <div className="relative h-44 shrink-0 overflow-hidden rounded border bg-white" style={{containerType:"size"}}><SlideSceneTableView object={{...object,table:draft}} sceneWidth={object.w}/></div>
      </div>
      <aside className="w-full shrink-0 space-y-3 overflow-auto rounded border bg-white p-3 text-xs lg:w-72">
        <strong>Selection {range.row+1}:{range.column+1} – {range.endRow+1}:{range.endColumn+1}</strong>
        {merge&&<p className="text-amber-800">This cell belongs to a merged region. Covered values are visible here but hidden in the slide until unmerged.</p>}
        <label className="block">Cell text<textarea aria-label="Selected cell text" className={field+" mt-1 w-full"} rows={4} maxLength={SCENE_TABLE_LIMITS.cellText} disabled={disabled} value={cell.text} onChange={e=>change(t=>patchSceneTable(t,tableRange(active),{text:e.target.value}))}/></label>
        <p className="text-slate-500">Formatting applies to the entire selected rectangle; text edits only the active cell.</p>
        {(["bold","italic","underline"] as const).map(key=><label key={key} className="flex justify-between capitalize">{key}<input aria-label={`Cell ${key}`} type="checkbox" checked={cell[key]??(key==="bold"&&draft.headerRow&&active.row===0)} disabled={disabled} onChange={e=>patch({[key]:e.target.checked})}/></label>)}
        <DraftValue label="Cell font size" type="number" value={cell.fontSize??object.fontSize??22} disabled={disabled} onSave={value=>{const n=Number(value);if(value.trim()&&Number.isFinite(n))patch({fontSize:n});else setError("Enter a valid font size.");}}/>
        <DraftValue label="Cell font" value={cell.fontFamily??object.fontFamily??"Arial"} disabled={disabled} onSave={fontFamily=>patch({fontFamily})}/>
        <DraftValue label="Cell text color" value={cell.color??(draft.headerRow&&active.row===0?"#ffffff":object.color??"#0f172a")} disabled={disabled} onSave={color=>patch({color})}/>
        <DraftValue label="Cell fill" value={cell.fill??(draft.headerRow&&active.row===0?object.fill??"#2563eb":"#ffffff")} disabled={disabled} onSave={fill=>patch({fill})}/>
        <label className="flex justify-between">Text align<select className={field} aria-label="Cell alignment" value={cell.align??"left"} disabled={disabled} onChange={e=>patch({align:e.target.value as SceneTableCell["align"]})}>{["left","center","right"].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="flex justify-between">Vertical align<select className={field} aria-label="Cell vertical alignment" value={cell.verticalAlign??"middle"} disabled={disabled} onChange={e=>patch({verticalAlign:e.target.value as SceneTableCell["verticalAlign"]})}>{["top","middle","bottom"].map(v=><option key={v}>{v}</option>)}</select></label>
        <DraftValue label="Row height share %" type="number" value={pct(draft.rowHeights,active.row)} disabled={disabled||draft.rows.length===1} onSave={v=>sizeShare("row",active.row,v)}/>
        <DraftValue label="Column width share %" type="number" value={pct(draft.columnWidths,active.column)} disabled={disabled||draft.rows[0].length===1} onSave={v=>sizeShare("column",active.column,v)}/>
        <label className="flex justify-between">Header row<input aria-label="Table header row" type="checkbox" checked={draft.headerRow} disabled={disabled} onChange={e=>change(t=>({...t,headerRow:e.target.checked}))}/></label>
        <details><summary>Paste tab-separated data</summary><textarea aria-label="Paste table TSV" rows={4} maxLength={SCENE_TABLE_LIMITS.totalText} className={field+" my-2 w-full"} value={paste} disabled={disabled} onChange={e=>setPaste(e.target.value)}/><button type="button" className={field} disabled={disabled} onClick={()=>change(t=>pasteSceneTable(t,active.row,active.column,paste))}>Paste grid at active cell</button></details>
      </aside>
    </div>
  </div>,document.body);
}
export function SlideSceneTableControls({object,readOnly,onPatch}:{object:SlideSceneObject;readOnly:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void}){
  const [open,setOpen]=useState(false);
  if(!object.table)return null;
  return <div className="rounded border p-2"><strong>{object.table.rows.length} × {object.table.rows[0].length} table</strong><button type="button" className={field+" mt-2 w-full"} disabled={readOnly||object.locked} onClick={()=>setOpen(true)}>Edit table cells</button>
    {open&&<SlideSceneTableEditor object={object} readOnly={readOnly} onClose={()=>setOpen(false)} onApply={table=>onPatch({table})}/>}
  </div>;
}
