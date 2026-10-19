"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { sceneObject, scenePatchObject, type SlideScene, type SlideSceneObject, type SceneObjectKind } from "../../types/slideScene";
import { sceneTextSignature } from "../../types/slideSceneText";
import { SlideSceneSurface } from "./SlideSceneSurface";
import { SlideSceneTimeline } from "./SlideSceneTimeline";
import { SlideSceneProperties, sceneField as field } from "./SlideSceneProperties";
import { SlideSceneRichTextEditor } from "./SlideSceneRichTextEditor";
import { useSlideSceneHistory } from "../../hooks/useSlideSceneHistory";
import { inspectSlideScene } from "../../utils/slideSceneInspect";
import { alignSceneObjects, distributeSceneObjects, snapSceneRect, setSceneObjectGeometry, type SceneAlign } from "../../utils/slideSceneGeometry";
import { deleteSceneSelection, duplicateSceneSelection, expandSceneSelection, groupSceneObjects, moveSceneSelectionLayer, translateSceneSelection, ungroupSceneObjects } from "../../utils/slideSceneGroups";
import { resizeSceneSelection, rotateSceneSelection, sceneSelectionBounds } from "../../utils/slideSceneGroupTransform";
import { uploadWorkspaceImageWithOriginal } from "../../utils/imageUpload";
type Props={scene:SlideScene;onChange:(scene:SlideScene)=>void;readOnly?:boolean;backgroundColor?:string};
export function SlideSceneEditor({scene,onChange,readOnly=false,backgroundColor="#FFFFFF"}:Props){
  const editor=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),timeline=useRef<HTMLDivElement>(null);
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[selected,setSelected]=useState<string|null>(null),[textEdit,setTextEdit]=useState<{id:string;signature:string}|null>(null);
  const [richEdit,setRichEdit]=useState<{object:SlideSceneObject;signature:string}|null>(null);
  const [snap,setSnap]=useState(true),[imageUrl,setImageUrl]=useState(""),[uploading,setUploading]=useState(false),[message,setMessage]=useState("");
  const history=useSlideSceneHistory(scene,onChange,readOnly),{commit}=history;
  const item=scene.objects.find(o=>o.id===selected),locked=scene.objects.some(o=>selectedIds.includes(o.id)&&o.locked);
  const warnings=useMemo(()=>inspectSlideScene(scene,backgroundColor),[scene,backgroundColor]);
  const ids=selectedIds.length?selectedIds:selected?[selected]:[];
  const select=(id:string,additive=false,source=scene)=>{
    const expanded=expandSceneSelection(source,[id]),members=expanded.length?expanded:[id];
    const next=additive?(members.every(key=>selectedIds.includes(key))?selectedIds.filter(key=>!members.includes(key)):[...new Set([...selectedIds,...members])]):members;
    setSelectedIds(next);setSelected(next.includes(id)?id:next[0]??null);
  };
  useEffect(()=>{
    const existing=new Set(scene.objects.map(o=>o.id));
    setSelectedIds(current=>current.every(id=>existing.has(id))?current:current.filter(id=>existing.has(id)));
    if(selected&&!existing.has(selected))setSelected(null);
    if(textEdit&&(!existing.has(textEdit.id)||readOnly))setTextEdit(null);
    if(richEdit&&(!existing.has(richEdit.object.id)||readOnly||scene.objects.find(o=>o.id===richEdit.object.id)?.locked))setRichEdit(null);
  },[scene.objects,selected,textEdit,richEdit,readOnly]);
  const patch=(values:Partial<SlideSceneObject>)=>{if(item&&!readOnly&&!item.locked)commit(scenePatchObject(scene,item.id,values));};
  const beginRichText=(id:string)=>{
    const object=scene.objects.find(o=>o.id===id);
    if(!readOnly&&object?.kind==="text"&&!object.locked){setTextEdit(null);setRichEdit({object:structuredClone(object),signature:sceneTextSignature(object)});}
  };
  const beginText=(id:string)=>{const object=scene.objects.find(o=>o.id===id);if(!readOnly&&object?.kind==="text"&&!object.locked){if(object.richText)beginRichText(id);else setTextEdit({id,signature:sceneTextSignature(object)});}};
  const finishText=(id:string,text:string)=>{
    const object=scene.objects.find(o=>o.id===id);
    if(object&&textEdit?.id===id&&sceneTextSignature(object)!==textEdit.signature)setMessage("This text was changed elsewhere. Your draft was not applied over it.");
    else if(object&&!object.locked&&!readOnly)commit(scenePatchObject(scene,id,{text}));
    setTextEdit(null);
  };
  const duplicate=()=>{
    const next=duplicateSceneSelection(scene,ids,()=>crypto.randomUUID());
    if(next!==scene&&commit(next)){const added=next.objects.filter(o=>!scene.objects.some(before=>before.id===o.id));setSelectedIds(added.map(o=>o.id));setSelected(added[0]?.id??null);}
  };
  const remove=()=>{if(readOnly)return;commit(deleteSceneSelection(scene,ids));setSelected(null);setSelectedIds([]);};
  const add=(kind:SceneObjectKind)=>{
    if(readOnly||scene.objects.length>=120)return;
    const next=sceneObject(kind,80+(scene.objects.length%12)*16,100+(scene.objects.length%12)*12);
    if(kind==="image")next.src=imageUrl.trim();
    const draft={...scene,objects:[...scene.objects,next]};
    if(commit(draft)){select(next.id,false,draft);setMessage("");}else setMessage("The object could not be inserted. Check its image URL or data.");
  };
  const upload=async(file?:File)=>{
    if(!file||readOnly||uploading||scene.objects.length>=120)return;
    const started=history.signature;setUploading(true);setMessage("");
    try{
      const result=await uploadWorkspaceImageWithOriginal(file);if(!result?.url)throw new Error("Image upload failed.");
      if(!history.isCurrent(started))throw new Error("The slide changed during upload. Insert the image again to avoid overwriting newer edits.");
      const object=sceneObject("image",100,100);object.src=result.url;
      const draft={...scene,objects:[...scene.objects,object]};if(commit(draft))select(object.id,false,draft);
    }catch(error){setMessage(error instanceof Error?error.message:"Image upload failed.");}finally{setUploading(false);}
  };
  const keyDown=(e:React.KeyboardEvent)=>{
    if(readOnly||e.isDefaultPrevented()||e.nativeEvent.isComposing)return;
    const target=e.target as HTMLElement;if(target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
    const consume=()=>{e.preventDefault();e.stopPropagation();},modifier=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(modifier&&key==="z"){consume();e.shiftKey?history.redo():history.undo();return;}
    if(modifier&&key==="y"){consume();history.redo();return;}
    if(modifier&&key==="a"){consume();setSelectedIds(scene.objects.map(o=>o.id));setSelected(scene.objects[0]?.id??null);return;}
    if(textEdit||richEdit||!selected)return;
    if(e.key==="F2"||e.key==="Enter"){consume();beginText(selected);return;}
    if(modifier&&key==="g"){consume();commit(e.shiftKey?ungroupSceneObjects(scene,ids):groupSceneObjects(scene,ids,()=>crypto.randomUUID()));return;}
    if(modifier&&key==="d"){consume();duplicate();return;}
    if(e.key==="Delete"||e.key==="Backspace"){consume();remove();return;}
    if(e.key==="Escape"){consume();setSelected(null);setSelectedIds([]);return;}
    const move:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!modifier&&move[e.key]){consume();const [dx,dy]=move[e.key],amount=e.shiftKey?10:1;commit(translateSceneSelection(scene,ids,dx*amount,dy*amount));}
  };
  const scaleSelection=(scale:number)=>{const bounds=sceneSelectionBounds(scene,ids);if(!bounds)return;const delta=1-scale;commit(resizeSceneSelection(scene,ids,{x:bounds.x+bounds.w*delta/2,y:bounds.y+bounds.h*delta/2,w:bounds.w*scale,h:bounds.h*scale}));};
  return <div ref={editor} tabIndex={0} aria-label="Slide scene editor" onKeyDown={keyDown} onPointerDownCapture={e=>{const target=e.target as HTMLElement;if(target.closest("[data-scene-object]")&&!target.closest("textarea,input,[contenteditable]"))editor.current?.focus({preventScroll:true});}} className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-900">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white p-2 text-xs">
      <strong>Scene editor</strong><label className="flex items-center gap-1"><input aria-label="Snap to grid" type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap 8px</label>
      <button type="button" className={field} disabled={readOnly||!history.canUndo} onClick={history.undo}>Undo</button><button type="button" className={field} disabled={readOnly||!history.canRedo} onClick={history.redo}>Redo</button>
      {(["text","shape","chart","table"] as const).map(kind=><button type="button" key={kind} className={field} disabled={readOnly||scene.objects.length>=120} onClick={()=>add(kind)}>+ {kind}</button>)}
      <input className={field+" w-40"} aria-label="Image URL" disabled={readOnly} value={imageUrl} placeholder="Image URL" onChange={e=>setImageUrl(e.target.value)}/>
      <button type="button" className={field} disabled={readOnly||!imageUrl.trim()} onClick={()=>add("image")}>+ Image URL</button>
      <button type="button" className={field} disabled={readOnly||uploading} onClick={()=>fileInput.current?.click()}>{uploading?"Uploading...":"Upload image"}</button>
      <input ref={fileInput} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void upload(file);}}/>
      <span className="ml-auto text-slate-500">{scene.objects.length} objects</span>
    </div>
    {message&&<p role="status" className="px-3 py-1 text-xs text-amber-900">{message}</p>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <div className="flex min-h-24 min-w-0 flex-1 items-center justify-center overflow-auto p-3"><div className="relative w-full max-w-5xl overflow-hidden border shadow" style={{aspectRatio:`${scene.width}/${scene.height}`,backgroundColor}} onPointerDown={e=>{if(textEdit||richEdit)return;editor.current?.focus({preventScroll:true});if(!(e.target as Element).closest("[data-scene-object],[data-slide-selection-box]")){setSelected(null);setSelectedIds([]);}}}>
        <SlideSceneSurface scene={scene} selected={selected} selectedIds={selectedIds} editing={!readOnly} onSelect={select} editingTextId={textEdit?.id} onRequestTextEdit={beginText} onTextCancel={()=>setTextEdit(null)} onTextCommit={finishText}
          onMove={(id,x,y)=>{const original=scene.objects.find(o=>o.id===id);if(!original||readOnly||original.locked)return;const next=snapSceneRect({...original,x,y},snap);commit(translateSceneSelection(scene,selectedIds.includes(id)?selectedIds:[id],next.x-original.x,next.y-original.y));}}
          onResize={(id,rect)=>{const object=scene.objects.find(o=>o.id===id);if(!readOnly&&object&&!object.locked)commit(setSceneObjectGeometry(scene,id,snapSceneRect(rect,snap)));}} onTransformSelection={next=>commit(next)}/>
      </div></div>
      <aside className="max-h-52 shrink-0 space-y-3 overflow-auto border-l bg-white p-3 text-xs md:max-h-none md:w-60">
        <strong className="block">Layers</strong>
        {warnings.length>0&&<details className="rounded border border-amber-300 p-2"><summary>{warnings.length} layout warnings</summary>{warnings.map((w,i)=><button type="button" key={`${w.objectId}-${i}`} onClick={()=>select(w.objectId)} className="mt-1 block w-full text-left text-amber-800">{w.code}: {w.message}</button>)}</details>}
        {[...scene.objects].reverse().map(o=><button type="button" key={o.id} onClick={e=>select(o.id,e.shiftKey)} className={`block w-full truncate rounded px-2 py-1 text-left ${selectedIds.includes(o.id)?"bg-indigo-100":"hover:bg-slate-100"}`}>{o.locked?"[Locked] ":""}{o.kind}: {o.text?.slice(0,18)||o.id.slice(0,8)}</button>)}
        {ids.length>1&&<p className="text-indigo-700">{ids.length} selected</p>}
        {ids.length>1&&!readOnly&&<div className="flex flex-wrap gap-1"><button type="button" className={field} disabled={locked} onClick={()=>commit(groupSceneObjects(scene,ids,()=>crypto.randomUUID()))}>Group</button><button type="button" className={field} disabled={locked} onClick={()=>commit(ungroupSceneObjects(scene,ids))}>Ungroup</button>
          {[-15,15].map(degrees=><button type="button" key={degrees} className={field} disabled={locked} onClick={()=>commit(rotateSceneSelection(scene,ids,degrees))}>Rotate {degrees}°</button>)}{[0.9,1.1].map(scale=><button type="button" key={scale} className={field} disabled={locked} onClick={()=>scaleSelection(scale)}>Scale {scale<1?"-10%":"+10%"}</button>)}
        </div>}
        {item&&<div className="flex flex-wrap gap-1">{(["left","center","right","top","middle","bottom"] as SceneAlign[]).map(direction=><button type="button" key={direction} className={field} disabled={readOnly||locked} onClick={()=>commit(alignSceneObjects(scene,ids,direction))}>{direction}</button>)}{ids.length>2&&(["x","y"] as const).map(axis=><button type="button" key={axis} className={field} disabled={readOnly||locked} onClick={()=>commit(distributeSceneObjects(scene,ids,axis))}>Distribute {axis==="x"?"H":"V"}</button>)}</div>}
        {item&&<><hr/><SlideSceneProperties key={item.id} object={item} readOnly={readOnly} onPatch={patch} onLock={value=>{if(!readOnly)commit(scenePatchObject(scene,item.id,{locked:value}));}} onEditText={()=>beginText(item.id)} onFormatText={()=>beginRichText(item.id)} onTimeline={()=>{timeline.current?.scrollIntoView({block:"nearest"});timeline.current?.focus();}}/>
          <div className="flex flex-wrap gap-1"><button type="button" className={field} disabled={readOnly||locked||scene.objects.length>=120} onClick={duplicate}>Duplicate</button><button type="button" className={field} disabled={readOnly||locked} onClick={()=>commit(moveSceneSelectionLayer(scene,ids,-1))}>Back</button><button type="button" className={field} disabled={readOnly||locked} onClick={()=>commit(moveSceneSelectionLayer(scene,ids,1))}>Front</button><button type="button" className={field} disabled={readOnly||locked} onClick={remove}>Delete</button></div>
        </>}
      </aside>
    </div>
    <div ref={timeline} tabIndex={-1}><SlideSceneTimeline scene={scene} selected={selected} onSelect={select} onChange={next=>commit(next)} readOnly={readOnly} backgroundColor={backgroundColor}/></div>
    {richEdit&&!readOnly&&<SlideSceneRichTextEditor key={richEdit.object.id} object={richEdit.object} backgroundColor={backgroundColor} onCancel={()=>setRichEdit(null)} onApply={richText=>{
      const current=scene.objects.find(o=>o.id===richEdit.object.id);
      if(!current||current.locked||sceneTextSignature(current)!==richEdit.signature)return false;
      const next=scenePatchObject(scene,current.id,{richText});
      if(JSON.stringify(next)!==JSON.stringify(scene)&&!commit(next))return false;
      setRichEdit(null);return true;
    }}/>}
  </div>;
}
