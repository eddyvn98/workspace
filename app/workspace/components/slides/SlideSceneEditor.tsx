"use client";
import React, { useMemo, useState } from "react";
import type { SlideScene, SlideSceneObject } from "../../types/slideScene";
import { sceneMoveObject, sceneObject, scenePatchObject } from "../../types/slideScene";
import { SlideSceneSurface } from "./SlideSceneSurface";
import { SlideSceneTimeline } from "./SlideSceneTimeline";
import { inspectSlideScene } from "../../utils/slideSceneInspect";
import { alignSceneObjects, snapSceneRect, setSceneObjectGeometry, type SceneAlign } from "../../utils/slideSceneGeometry";
import { deleteSceneSelection, duplicateSceneSelection, expandSceneSelection, groupSceneObjects, translateSceneSelection, ungroupSceneObjects } from "../../utils/slideSceneGroups";
import { useEffect, useRef } from "react";
import { uploadWorkspaceImageWithOriginal } from "../../utils/imageUpload";

type Props = { scene: SlideScene; onChange: (next: SlideScene) => void; readOnly?: boolean; backgroundColor?:string };
const field = "rounded border border-slate-300 bg-white px-2 py-1 text-slate-900";
export function SlideSceneEditor({ scene, onChange, readOnly = false,backgroundColor="#FFFFFF" }: Props) {
  const editorRef=useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const select = (id:string,additive=false) => {
    const members=expandSceneSelection(scene,[id]);
    setSelected(id);
    setSelectedIds(current => additive ? (members.every(x=>current.includes(x))?current.filter(x=>!members.includes(x)):[...new Set([...current,...members])]) : members);
  };
  const [imageUrl, setImageUrl] = useState("");
  const imageFileInput = useRef<HTMLInputElement>(null);
  const [uploading,setUploading] = useState(false);
  const history = useRef<{undo:SlideScene[];redo:SlideScene[]}>({undo:[],redo:[]});
  const [historyVersion,setHistoryVersion] = useState(0);
  const commit = (next:SlideScene) => { if(readOnly || next===scene || JSON.stringify(next)===JSON.stringify(scene)) return; history.current.undo.push(scene); if(history.current.undo.length>60) history.current.undo.shift(); history.current.redo=[]; setHistoryVersion(v=>v+1);onChange(next); };
  const undo = () => {const prior=history.current.undo.pop();if(!prior)return;history.current.redo.push(scene);onChange(prior);setHistoryVersion(v=>v+1);};
  const redo = () => {const next=history.current.redo.pop();if(!next)return;history.current.undo.push(scene);onChange(next);setHistoryVersion(v=>v+1);};
  const item = useMemo(() => scene.objects.find(o => o.id === selected), [scene, selected]);
  const qualityWarnings=useMemo(()=>inspectSlideScene(scene,backgroundColor),[scene,backgroundColor]);
  const patch = (values: Partial<SlideSceneObject>) => { if (item && !readOnly && !item.locked) commit(scenePatchObject(scene, item.id, values)); };
  const add = (kind: "text" | "shape" | "image" | "chart") => {
    if (readOnly) return;
    if (kind === "image" && !/^https?:\/\/|^\/(?!\/)/i.test(imageUrl)) return;
    if (scene.objects.length >= 120) return;
    const next = sceneObject(kind, 80 + scene.objects.length * 16, 100 + scene.objects.length * 12);
    if (kind === "image") next.src = imageUrl;
    commit({ ...scene, objects: [...scene.objects, next] });
    select(next.id);
  };
  const uploadImage=async(file?:File)=>{
    if(!file||readOnly||uploading||scene.objects.length>=120)return;
    setUploading(true);
    try { const result=await uploadWorkspaceImageWithOriginal(file);
      if(!result?.url) throw new Error("Upload failed");
      const next=sceneObject("image",100,100);next.src=result.url;
      commit({...scene,objects:[...scene.objects,next]});select(next.id);
    } catch(error){window.alert(error instanceof Error?error.message:"Image upload failed");}
    finally {setUploading(false);}
  };
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(readOnly)return;const target=e.target as HTMLElement;if(!editorRef.current?.contains(target))return;if(target?.closest("input,textarea,select,[contenteditable=true]"))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo();return;}
    if(editingTextId || !selected)return;
    if(e.key==="Enter"||e.key==="F2"){const targetObject=scene.objects.find(o=>o.id===selected);if(targetObject?.kind==="text"&&!targetObject.locked){e.preventDefault();setEditingTextId(selected);}return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="g"){e.preventDefault();const ids=selectedIds.length?selectedIds:[selected];commit(e.shiftKey?ungroupSceneObjects(scene,ids):groupSceneObjects(scene,ids,()=>crypto.randomUUID()));return;}
    if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();commit(deleteSceneSelection(scene,selectedIds.length?selectedIds:[selected]));setSelected(null);setSelectedIds([]);return;}
    const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(direction[e.key]){e.preventDefault();const [dx,dy]=direction[e.key];commit(translateSceneSelection(scene,selectedIds.length?selectedIds:[selected],dx*(e.shiftKey?10:1),dy*(e.shiftKey?10:1)));}
  };window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle);},[scene,selected,selectedIds,editingTextId,readOnly,historyVersion]);
  return <div ref={editorRef} tabIndex={0} onPointerDownCapture={event => {const target = event.target as HTMLElement; if (target.closest("[data-scene-object]") && !target.closest("textarea,input,[contenteditable]")) editorRef.current?.focus({preventScroll:true});}} className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-900">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white p-2 text-xs">
      <strong>Scene editor</strong>
      <button className={field} disabled={readOnly || !history.current.undo.length} onClick={undo}>Undo</button><button className={field} disabled={readOnly || !history.current.redo.length} onClick={redo}>Redo</button>
      <button className={field} disabled={readOnly} onClick={() => add("text")}>+ Text</button>
      <button className={field} disabled={readOnly} onClick={() => add("shape")}>+ Shape</button><button className={field} disabled={readOnly} onClick={() => add("chart")}>+ Chart</button>
      <input className={field + " w-40"} aria-label="Image URL" value={imageUrl} placeholder="Image URL" onChange={e => setImageUrl(e.target.value)} />
      <button className={field} disabled={readOnly || !imageUrl} onClick={() => add("image")}>+ Image URL</button>
      <button className={field} disabled={readOnly||uploading} onClick={()=>imageFileInput.current?.click()}>{uploading?"Uploading…":"Upload image"}</button>
      <input ref={imageFileInput} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void uploadImage(file);}}/>
      <span className="ml-auto text-slate-500">{scene.objects.length} objects</span>
    </div>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-3">
        <div className="relative w-full max-w-5xl overflow-hidden border shadow" style={{ aspectRatio: `${scene.width} / ${scene.height}`,backgroundColor }}
          onPointerDown={e => { if(editingTextId) return; editorRef.current?.focus({preventScroll:true});if (e.target === e.currentTarget) {setSelected(null);setSelectedIds([]);} }}>
          <SlideSceneSurface scene={scene} selected={selected} selectedIds={selectedIds} editing={!readOnly} onSelect={select}
            editingTextId={editingTextId} onRequestTextEdit={setEditingTextId} onTextCancel={() => setEditingTextId(null)}
            onTextCommit={(id,text) => {const old = scene.objects.find(o=>o.id===id); if(old && !old.locked && !readOnly) commit(scenePatchObject(scene,id,{text})); setEditingTextId(null);}}
            onMove={(id, x, y) => { if(readOnly)return;const original=scene.objects.find(o=>o.id===id);if(!original||original.locked)return;
              const snapped=snapSceneRect({...original,x,y});const ids=selectedIds.includes(id)?selectedIds:[id];
              commit(translateSceneSelection(scene,ids,snapped.x-original.x,snapped.y-original.y)); }}
            onResize={(id, rect) => { if (!readOnly) commit(setSceneObjectGeometry(scene,id,snapSceneRect(rect))); }} />
        </div>
      </div>
      <aside className="hidden w-56 shrink-0 space-y-3 overflow-auto border-l bg-white p-3 text-xs lg:block">
        <strong className="block">Layers</strong>
        {qualityWarnings.length>0 && <details className="rounded border border-amber-300 p-2"><summary className="cursor-pointer">{qualityWarnings.length} layout warnings</summary>{qualityWarnings.map((w,i)=><button type="button" key={`${w.objectId}-${i}`} onClick={()=>select(w.objectId)} className="mt-1 block w-full text-left text-amber-800">{w.code}: {w.message}</button>)}</details>}
        {[...scene.objects].reverse().map(o => <button key={o.id} onClick={(e) => select(o.id,e.shiftKey)}
          className={`block w-full truncate rounded px-2 py-1 text-left ${selectedIds.includes(o.id) ? "bg-indigo-100" : "hover:bg-slate-100"}`}>{o.locked ? "🔒 " : ""}{o.kind} · {o.text?.slice(0, 18) || o.id.slice(0, 8)}</button>)}
        {selectedIds.length > 1 && <p className="text-indigo-700">{selectedIds.length} selected (Shift+click). Align selected objects:</p>}
        {selectedIds.length > 1 && !readOnly && <div className="flex flex-wrap gap-1"><button className={field} type="button" title="Group (Ctrl/Cmd+G)" onClick={()=>commit(groupSceneObjects(scene,selectedIds,()=>crypto.randomUUID()))}>Group</button><button className={field} type="button" title="Ungroup (Ctrl/Cmd+Shift+G)" onClick={()=>commit(ungroupSceneObjects(scene,selectedIds))}>Ungroup</button></div>}
        {item && <div className="flex flex-wrap gap-1">{(["left","center","right","top","middle","bottom"] as SceneAlign[]).map(direction=><button key={direction} className={field} disabled={readOnly || item.locked} onClick={()=>commit(alignSceneObjects(scene,selectedIds.length?selectedIds:[item.id],direction))}>{direction}</button>)}</div>}
        {item && <>
          <hr/><strong className="block">Object properties</strong>
          {item.kind === "chart" && <label className="block">Chart data (label, value per line)<textarea rows={4} className={field+" mt-1 w-full"} disabled={readOnly||item.locked} value={(item.series||[]).map(x=>`${x.label},${x.value}`).join("\n")} onChange={e=>{const series=e.target.value.split("\n").filter(Boolean).map(row=>{const comma=row.lastIndexOf(",");return {label:row.slice(0,comma).trim(),value:Number(row.slice(comma+1))};}); if(series.length>=1 && series.length<=24 && series.every(x=>x.label && Number.isFinite(x.value) && x.value>=0)) patch({series});}} /></label>}
          {item.kind === "text" && !readOnly && !item.locked && <button className={field+" w-full"} type="button" onClick={()=>setEditingTextId(item.id)}>Edit text on slide</button>}
          {item.kind === "text" && <label className="block">Text<textarea className={field + " mt-1 w-full"} rows={3} value={item.text || ""} disabled={readOnly} onChange={e => patch({ text: e.target.value })}/></label>}
          {(["x","y","w","h","rotation","opacity"] as const).map(k => <label key={k} className="flex items-center justify-between gap-2 capitalize">{k}<input className={field + " w-24"} type="number" step={k === "opacity" ? 0.1 : 1} value={item[k] ?? 0} disabled={readOnly || item.locked} onChange={e => patch({ [k]: Number(e.target.value) })}/></label>)}
          {item.kind === "text" && <label className="flex items-center justify-between">Font size<input type="number" className={field + " w-24"} value={item.fontSize || 44} disabled={readOnly} onChange={e => patch({fontSize:Number(e.target.value)})}/></label>}
          <label className="flex items-center justify-between">Color<input className={field + " w-24"} value={item.kind === "text" ? item.color || "" : item.fill || ""} disabled={readOnly} onChange={e => patch(item.kind === "text" ? { color: e.target.value } : { fill: e.target.value })}/></label>
          <label className="flex items-center justify-between">Locked<input type="checkbox" checked={!!item.locked} disabled={readOnly} onChange={e => commit(scenePatchObject(scene,item.id,{locked:e.target.checked}))}/></label>
          <strong className="block">Animation</strong>
          <label className="block">Effect<select className={field + " w-full"} value={item.motion?.kind || "none"} disabled={readOnly} onChange={e => patch({motion:{kind:e.target.value as NonNullable<SlideSceneObject["motion"]>["kind"],trigger:item.motion?.trigger||"with-previous",durationMs:item.motion?.durationMs||450,delayMs:item.motion?.delayMs||0}})}>
            {["none","fade","rise","slide","zoom","wipe"].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="block">Trigger<select className={field + " w-full"} value={item.motion?.trigger || "with-previous"} disabled={readOnly} onChange={e => patch({motion:{kind:item.motion?.kind||"fade",trigger:e.target.value as NonNullable<SlideSceneObject["motion"]>["trigger"],durationMs:item.motion?.durationMs||450,delayMs:item.motion?.delayMs||0}})}>
            {["with-previous","after-previous","on-click"].map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="flex items-center justify-between">Duration ms<input className={field + " w-24"} type="number" value={item.motion?.durationMs || 450} disabled={readOnly} onChange={e => patch({motion:{kind:item.motion?.kind||"fade",trigger:item.motion?.trigger||"with-previous",durationMs:Number(e.target.value),delayMs:item.motion?.delayMs||0}})}/></label>
          <div className="flex gap-2"><button className={field} disabled={readOnly || scene.objects.length>=120} onClick={()=>{const next=duplicateSceneSelection(scene,selectedIds.length?selectedIds:[item.id],()=>crypto.randomUUID());commit(next);select(next.objects[next.objects.length-1].id);}}>Duplicate</button>
            <button className={field} disabled={readOnly || !!item.locked} onClick={() => commit(sceneMoveObject(scene,item.id,-1))}>Back</button>
            <button className={field} disabled={readOnly || !!item.locked} onClick={() => commit(sceneMoveObject(scene,item.id,1))}>Front</button>
            <button className={field} disabled={readOnly || !!item.locked} onClick={() => {commit(deleteSceneSelection(scene,selectedIds.length?selectedIds:[item.id]));setSelected(null);setSelectedIds([]);}}>Delete</button>
          </div>
        </>}
      </aside>
    </div>
    <SlideSceneTimeline scene={scene} selected={selected} onSelect={select} readOnly={readOnly} onChange={commit}/>
  </div>;
}
