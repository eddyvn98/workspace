"use client";
import React from "react";
import { AlignCenter, AlignLeft, AlignRight, ChartColumn, Clapperboard, Copy, ImagePlus, PanelRightClose, PanelRightOpen, Redo2, Shapes, Table2, Trash2, Type, Undo2 } from "lucide-react";
import { SCENE_SHAPES, type SceneShapeKind } from "../../types/slideSceneShape";
import type { SlideScene, SlideSceneObject, SceneObjectKind } from "../../types/slideScene";
import { SlideSceneDiagramInsert } from "./SlideSceneDiagramInsert";

type Props = {
  scene:SlideScene; item?:SlideSceneObject; selectedCount:number; selectedLocked:boolean;
  readOnly:boolean; uploading:boolean; canUndo:boolean; canRedo:boolean;
  snap:boolean; showInspector:boolean; showTimeline:boolean;
  imageUrl:string; onImageUrl:(value:string)=>void;
  onAdd:(kind:SceneObjectKind)=>void; onUpload:()=>void; onDiagram:(next:SlideScene)=>void;
  onUndo:()=>void; onRedo:()=>void; onDuplicate:()=>void; onDelete:()=>void;
  onGroup:()=>void; onUngroup:()=>void;
  onPatch:(patch:Partial<SlideSceneObject>)=>void; onFormat:()=>void;
  onShowProperties:()=>void;
  onSnap:(value:boolean)=>void; onToggleInspector:()=>void; onToggleTimeline:()=>void;
};
const button="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40";
const active="border-indigo-300 bg-indigo-50 text-indigo-700";
const divider="mx-1 h-6 shrink-0 border-l border-slate-200";
const tools:[SceneObjectKind,string,React.ComponentType<{className?:string}>][]=[
  ["text","Text box",Type],["shape","Shape",Shapes],["chart","Chart",ChartColumn],["table","Table",Table2],
];
export function SlideSceneRibbon(p:Props) {
  const full=p.scene.objects.length>=120,disabled=p.readOnly||full;
  const selected=!!p.item,editable=selected&&!p.readOnly&&!p.item?.locked,canArrange=p.selectedCount>0&&!p.readOnly&&!p.selectedLocked;
  const isText=p.item?.kind==="text";
  return <div aria-label="Slide editing tools" className="shrink-0 border-b border-slate-200 bg-white text-slate-800">
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-2" aria-label="Insert and edit slide objects">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Home</span>
      <button type="button" className={button} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={p.readOnly||!p.canUndo} onClick={p.onUndo}><Undo2 className="h-4 w-4"/></button>
      <button type="button" className={button} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={p.readOnly||!p.canRedo} onClick={p.onRedo}><Redo2 className="h-4 w-4"/></button>
      <span className={divider} aria-hidden="true"/>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Insert</span>
      {tools.map(([kind,label,Icon])=><button key={kind} type="button" className={button} disabled={disabled} onClick={()=>p.onAdd(kind)}><Icon className="h-4 w-4"/>{label}</button>)}
      <button type="button" className={button} disabled={disabled||p.uploading} onClick={p.onUpload}><ImagePlus className="h-4 w-4"/>{p.uploading?"Uploading...":"Image"}</button>
      <SlideSceneDiagramInsert scene={p.scene} readOnly={disabled} onInsert={p.onDiagram}/>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1.5 px-1 text-xs text-slate-600"><input type="checkbox" aria-label="Snap to grid" checked={p.snap} onChange={e=>p.onSnap(e.target.checked)}/>Snap</label>
        <button type="button" className={button+(p.showTimeline?" "+active:"")} aria-pressed={p.showTimeline} aria-label="Toggle animation timeline" onClick={p.onToggleTimeline}><Clapperboard className="h-4 w-4"/>Animation</button>
        <button type="button" className={button+(p.showInspector?" "+active:"")} aria-pressed={p.showInspector} aria-label="Toggle inspector" onClick={p.onToggleInspector}>
          {p.showInspector?<PanelRightClose className="h-4 w-4"/>:<PanelRightOpen className="h-4 w-4"/>}Inspector
        </button>
      </div>
    </div>
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/80 px-2 py-1.5" aria-label="Selection and formatting tools">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Format</span>
      {isText&&<>
        <button type="button" className={button+(p.item?.fontWeight==="bold"?" "+active:"")} aria-label="Bold text" title="Bold entire text box" disabled={!editable} onClick={()=>p.onPatch({fontWeight:p.item?.fontWeight==="bold"?"normal":"bold"})}><strong>B</strong></button>
        <button type="button" className={button+(p.item?.italic?" "+active:"")} aria-label="Italic text" title="Italic entire text box" disabled={!editable} onClick={()=>p.onPatch({italic:!p.item?.italic})}><em>I</em></button>
        <button type="button" className={button+(p.item?.underline?" "+active:"")} aria-label="Underline text" title="Underline entire text box" disabled={!editable} onClick={()=>p.onPatch({underline:!p.item?.underline})}><u>U</u></button>
        <label className="flex items-center gap-1 text-xs text-slate-600">Size<input aria-label="Text font size" type="number" min={8} max={180} className="w-14 rounded border border-slate-300 bg-white px-1 py-1.5" disabled={!editable} value={p.item?.fontSize??44} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=8&&v<=180)p.onPatch({fontSize:v});}}/></label>
        {(["left","center","right"] as const).map((direction,i)=>{
          const Icon=[AlignLeft,AlignCenter,AlignRight][i];
          return <button key={direction} type="button" className={button+(p.item?.align===direction?" "+active:"")} aria-label={`Align text ${direction}`} disabled={!editable} onClick={()=>p.onPatch({align:direction})}><Icon className="h-4 w-4"/></button>;
        })}
        <button type="button" className={button} disabled={!editable} onClick={p.onFormat}>Format selected text...</button>
      </>}
      {p.item?.kind==="shape"&&<>
        <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">Shape
          <select aria-label="Selected shape type" className="rounded border border-slate-300 bg-white px-1 py-1.5" disabled={!editable}
            value={p.item.shapeKind??"rect"} onChange={e=>p.onPatch({shapeKind:e.target.value as SceneShapeKind})}>
            {SCENE_SHAPES.map(shape=><option key={shape} value={shape}>{shape}</option>)}
          </select>
        </label>
      </>}
      {selected&&(isText||p.item?.kind==="shape")&&<label className="flex items-center gap-1 text-xs text-slate-600">
        Color <input aria-label="Object color" type="color" className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          disabled={!editable} value={p.item?.kind==="text"&&/^#[\da-f]{6}$/i.test(p.item.color??"")?p.item.color
            :p.item?.kind==="shape"&&/^#[\da-f]{6}$/i.test(p.item.fill??"")?p.item.fill:"#4f46e5"}
          onChange={e=>p.onPatch(p.item?.kind==="text"?{color:e.target.value}:{fill:e.target.value})}/>
      </label>}
      {selected&&!isText&&<button type="button" className={button} onClick={p.onShowProperties}>{p.item?.kind} settings</button>}
      {!selected&&<span className="text-xs text-slate-500">Select an object to edit text, color, size or position.</span>}
      {selected&&<div className="ml-auto flex flex-wrap items-center gap-1.5">
        {p.selectedCount>1&&<>
          <button type="button" className={button} disabled={!canArrange} onClick={p.onGroup}>Group</button>
          <button type="button" className={button} disabled={!canArrange} onClick={p.onUngroup}>Ungroup</button>
        </>}
        <button type="button" className={button} disabled={!canArrange||full} onClick={p.onDuplicate}><Copy className="h-4 w-4"/>Duplicate</button>
        <button type="button" className={button} disabled={!canArrange} onClick={p.onDelete}><Trash2 className="h-4 w-4"/>Delete</button>
      </div>}
      <details className={selected?"shrink-0":"ml-auto shrink-0"}>
        <summary className="cursor-pointer rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">Image URL</summary>
        <div className="flex items-center gap-1 py-1">
          <input aria-label="Image URL" className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs" disabled={p.readOnly} value={p.imageUrl} placeholder="https://..." onChange={e=>p.onImageUrl(e.target.value)}/>
          <button type="button" className={button} disabled={disabled||!p.imageUrl.trim()} onClick={()=>p.onAdd("image")}>Insert URL</button>
        </div>
      </details>
      <span className="text-[11px] text-slate-400">{p.scene.objects.length}/120</span>
    </div>
  </div>;
}
