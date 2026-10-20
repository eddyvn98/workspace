"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers3 } from "lucide-react";
import { sceneObject, scenePatchObject, type SlideScene, type SlideSceneObject, type SceneObjectKind } from "../../types/slideScene";
import { sceneTextSignature } from "../../types/slideSceneText";
import { SlideSceneSurface } from "./SlideSceneSurface";
import { SlideSceneTimeline } from "./SlideSceneTimeline";
import { SlideSceneProperties, sceneField as field } from "./SlideSceneProperties";
import { SlideSceneRichTextEditor } from "./SlideSceneRichTextEditor";
import { SlideSceneRibbon } from "./SlideSceneRibbon";
import { SlideSceneViewport } from "./SlideSceneViewport";
import { SlideSceneResizableInspector } from "./SlideSceneResizableInspector";
import { useSlideSceneHistory, type SlideSceneHistorySlot } from "../../hooks/useSlideSceneHistory";
import { inspectSlideScene } from "../../utils/slideSceneInspect";
import { alignSceneObjects, distributeSceneObjects, snapSceneRect, setSceneObjectGeometry, type SceneAlign } from "../../utils/slideSceneGeometry";
import { deleteSceneSelection, duplicateSceneSelection, expandSceneSelection, groupSceneObjects, moveSceneSelectionLayer, translateSceneSelection, ungroupSceneObjects } from "../../utils/slideSceneGroups";
import { resizeSceneSelection, rotateSceneSelection, sceneSelectionBounds } from "../../utils/slideSceneGroupTransform";
import { uploadWorkspaceImageWithOriginal } from "../../utils/imageUpload";
type Props={scene:SlideScene;onChange:(scene:SlideScene)=>void;readOnly?:boolean;backgroundColor?:string;slideNumber?:number;historySlot?:SlideSceneHistorySlot};
export function SlideSceneEditor({scene,onChange,readOnly=false,backgroundColor="#FFFFFF",slideNumber,historySlot}:Props){
  const editor=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[selected,setSelected]=useState<string|null>(null),[textEdit,setTextEdit]=useState<{id:string;signature:string}|null>(null);
  const [richEdit,setRichEdit]=useState<{object:SlideSceneObject;signature:string}|null>(null);
  const [snap,setSnap]=useState(true),[imageUrl,setImageUrl]=useState(""),[uploading,setUploading]=useState(false),[message,setMessage]=useState("");
  const [showInspector,setShowInspector]=useState(true),[inspectorTab,setInspectorTab]=useState<"layers"|"properties">("layers");
  const [showTimeline,setShowTimeline]=useState(false),[inspectorWidth,setInspectorWidth]=useState(288);
  const history=useSlideSceneHistory(scene,onChange,readOnly,historySlot),{commit}=history;
  const item=scene.objects.find(o=>o.id===selected),locked=scene.objects.some(o=>selectedIds.includes(o.id)&&o.locked);
  const warnings=useMemo(()=>inspectSlideScene(scene,backgroundColor),[scene,backgroundColor]),ids=selectedIds.length?selectedIds:selected?[selected]:[];
  const select=(id:string,additive=false,source=scene,focusProperties=true)=>{
    const expanded=expandSceneSelection(source,[id]),members=expanded.length?expanded:[id];
    const next=additive?(members.every(key=>selectedIds.includes(key))?selectedIds.filter(key=>!members.includes(key)):[...new Set([...selectedIds,...members])]):members;
    setSelectedIds(next);setSelected(next.includes(id)?id:next[0]??null);
    if(focusProperties)setInspectorTab("properties");
  };
  useEffect(()=>{
    const existing=new Set(scene.objects.map(o=>o.id));setSelectedIds(current=>current.every(id=>existing.has(id))?current:current.filter(id=>existing.has(id)));
    if(selected&&!existing.has(selected))setSelected(null);
    if(textEdit&&(!existing.has(textEdit.id)||readOnly))setTextEdit(null);
    if(richEdit&&(!existing.has(richEdit.object.id)||readOnly||scene.objects.find(o=>o.id===richEdit.object.id)?.locked))setRichEdit(null);
  },[scene.objects,selected,textEdit,richEdit,readOnly]);
  const patch=(values:Partial<SlideSceneObject>)=>{if(item&&!readOnly&&!item.locked)commit(scenePatchObject(scene,item.id,values));};
  const beginRichText=(id:string)=>{const object=scene.objects.find(o=>o.id===id);if(!readOnly&&object?.kind==="text"&&!object.locked){setTextEdit(null);setRichEdit({object:structuredClone(object),signature:sceneTextSignature(object)});}};
  const beginText=(id:string)=>{const object=scene.objects.find(o=>o.id===id);if(!readOnly&&object?.kind==="text"&&!object.locked){if(object.richText)beginRichText(id);else setTextEdit({id,signature:sceneTextSignature(object)});}};
  const finishText=(id:string,text:string)=>{
    const object=scene.objects.find(o=>o.id===id);
    if(object&&textEdit?.id===id&&sceneTextSignature(object)!==textEdit.signature)setMessage("This text was changed elsewhere. Your draft was not applied over it.");
    else if(object&&!object.locked&&!readOnly)commit(scenePatchObject(scene,id,{text}));setTextEdit(null);
  };
  const duplicate=()=>{const next=duplicateSceneSelection(scene,ids,()=>crypto.randomUUID());if(next!==scene&&commit(next)){const added=next.objects.filter(o=>!scene.objects.some(before=>before.id===o.id));setSelectedIds(added.map(o=>o.id));setSelected(added[0]?.id??null);}};
  const remove=()=>{if(readOnly)return;commit(deleteSceneSelection(scene,ids));setSelected(null);setSelectedIds([]);};
  const add=(kind:SceneObjectKind)=>{
    if(readOnly||scene.objects.length>=120)return;const next=sceneObject(kind,80+(scene.objects.length%12)*16,100+(scene.objects.length%12)*12);
    if(kind==="image")next.src=imageUrl.trim();const draft={...scene,objects:[...scene.objects,next]};
    if(commit(draft)){select(next.id,false,draft);setMessage("");}else setMessage("The object could not be inserted. Check its image URL or data.");
  };
  const upload=async(file?:File)=>{
    if(!file||readOnly||uploading||scene.objects.length>=120)return;const started=history.signature;setUploading(true);setMessage("");
    try{const result=await uploadWorkspaceImageWithOriginal(file);if(!result?.url)throw new Error("Image upload failed.");
      if(!history.isCurrent(started))throw new Error("The slide changed during upload. Insert the image again to avoid overwriting newer edits.");
      const object=sceneObject("image",100,100);object.src=result.url;const draft={...scene,objects:[...scene.objects,object]};if(commit(draft))select(object.id,false,draft);
    }catch(error){setMessage(error instanceof Error?error.message:"Image upload failed.");}finally{setUploading(false);}
  };
  const keyDown=(e:React.KeyboardEvent)=>{
    if(readOnly||e.isDefaultPrevented()||e.nativeEvent.isComposing)return;const target=e.target as HTMLElement;if(target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
    const consume=()=>{e.preventDefault();e.stopPropagation();},modifier=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(modifier&&key==="z"){consume();e.shiftKey?history.redo():history.undo();return;}if(modifier&&key==="y"){consume();history.redo();return;}
    if(modifier&&key==="a"){consume();setSelectedIds(scene.objects.map(o=>o.id));setSelected(scene.objects[0]?.id??null);return;}
    if(textEdit||richEdit||!selected)return;if(e.key==="F2"||e.key==="Enter"){consume();beginText(selected);return;}
    if(modifier&&key==="g"){consume();commit(e.shiftKey?ungroupSceneObjects(scene,ids):groupSceneObjects(scene,ids,()=>crypto.randomUUID()));return;}
    if(modifier&&key==="d"){consume();duplicate();return;}if(e.key==="Delete"||e.key==="Backspace"){consume();remove();return;}if(e.key==="Escape"){consume();setSelected(null);setSelectedIds([]);return;}
    const move:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!modifier&&move[e.key]){consume();const [dx,dy]=move[e.key],amount=e.shiftKey?10:1;commit(translateSceneSelection(scene,ids,dx*amount,dy*amount));}
  };
  const scaleSelection=(scale:number)=>{const bounds=sceneSelectionBounds(scene,ids);if(!bounds)return;const delta=1-scale;commit(resizeSceneSelection(scene,ids,{x:bounds.x+bounds.w*delta/2,y:bounds.y+bounds.h*delta/2,w:bounds.w*scale,h:bounds.h*scale}));};
  return <div ref={editor} tabIndex={0} aria-label="Slide scene editor" onKeyDown={keyDown} onPointerDownCapture={e=>{const target=e.target as HTMLElement;if(target.closest("[data-scene-object]")&&!target.closest("textarea,input,[contenteditable]"))editor.current?.focus({preventScroll:true});}} className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-900">
    <SlideSceneRibbon scene={scene} item={item} selectedCount={ids.length} selectedLocked={locked}
      readOnly={readOnly} uploading={uploading} canUndo={history.canUndo} canRedo={history.canRedo}
      snap={snap} showInspector={showInspector} showTimeline={showTimeline}
      imageUrl={imageUrl} onImageUrl={setImageUrl} onAdd={add} onUpload={()=>fileInput.current?.click()}
      onDiagram={next=>commit(next)} onUndo={history.undo} onRedo={history.redo}
      onDuplicate={duplicate} onDelete={remove}
      onGroup={()=>commit(groupSceneObjects(scene,ids,()=>crypto.randomUUID()))}
      onUngroup={()=>commit(ungroupSceneObjects(scene,ids))}
      onPatch={patch} onFormat={()=>{if(item)beginRichText(item.id);}}
      onShowProperties={()=>{setShowInspector(true);setInspectorTab("properties");}}
      onSnap={setSnap} onToggleInspector={()=>setShowInspector(v=>!v)} onToggleTimeline={()=>setShowTimeline(v=>!v)}/>
    <input ref={fileInput} hidden type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void upload(file);}}/>
    {message&&<p role="status" className="px-3 py-1 text-xs text-amber-900">{message}</p>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <SlideSceneViewport scene={scene} backgroundColor={backgroundColor}
        onStagePointerDown={e=>{if(textEdit||richEdit)return;editor.current?.focus({preventScroll:true});if(!(e.target as Element).closest("[data-scene-object],[data-slide-selection-box]")){setSelected(null);setSelectedIds([]);}}}>
        <SlideSceneSurface scene={scene} selected={selected} selectedIds={selectedIds} editing={!readOnly} onSelect={select} editingTextId={textEdit?.id} onRequestTextEdit={beginText} onTextCancel={()=>setTextEdit(null)} onTextCommit={finishText}
          onMove={(id,x,y)=>{const original=scene.objects.find(o=>o.id===id);if(!original||readOnly||original.locked)return;const next=snapSceneRect({...original,x,y},snap);commit(translateSceneSelection(scene,selectedIds.includes(id)?selectedIds:[id],next.x-original.x,next.y-original.y));}}
          onResize={(id,rect)=>{const object=scene.objects.find(o=>o.id===id);if(!readOnly&&object&&!object.locked)commit(setSceneObjectGeometry(scene,id,snapSceneRect(rect,snap)));}} onTransformSelection={next=>commit(next)}/>
        {slideNumber !== undefined && <span className="pointer-events-none absolute bottom-[2%] right-[2%] z-10 text-[1.2cqw] text-white mix-blend-difference" aria-label={`Slide number ${slideNumber}`}>{slideNumber}</span>}
      </SlideSceneViewport>
      {showInspector && <SlideSceneResizableInspector width={inspectorWidth} onWidthChange={setInspectorWidth}><div className="space-y-3">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 flex gap-1 border-b border-slate-200 bg-white p-2">
          <button type="button" aria-pressed={inspectorTab==="layers"} onClick={()=>setInspectorTab("layers")}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-2 text-sm ${inspectorTab==="layers"?"bg-indigo-50 font-semibold text-indigo-700":"text-slate-600 hover:bg-slate-100"}`}>
            <Layers3 className="h-4 w-4"/> Layers
          </button>
          <button type="button" aria-pressed={inspectorTab==="properties"} onClick={()=>setInspectorTab("properties")}
            className={`flex-1 rounded px-2 py-2 text-sm ${inspectorTab==="properties"?"bg-indigo-50 font-semibold text-indigo-700":"text-slate-600 hover:bg-slate-100"}`}>Format</button>
        </div>
        {inspectorTab==="layers" && <>
          <div className="text-xs text-slate-500">Top layers appear first. Shift-click for multi-selection.</div>
        {warnings.length>0&&<details className="rounded border border-amber-300 p-2"><summary>{warnings.length} layout warnings</summary>{warnings.map((w,i)=><button type="button" key={`${w.objectId}-${i}`} onClick={()=>select(w.objectId)} className="mt-1 block w-full text-left text-amber-800">{w.code}: {w.message}</button>)}</details>}
        {[...scene.objects].reverse().map(o=><button type="button" key={o.id} onClick={e=>select(o.id,e.shiftKey,scene,false)} className={`block w-full truncate rounded px-2 py-1 text-left ${selectedIds.includes(o.id)?"bg-indigo-100":"hover:bg-slate-100"}`}>{o.locked?"[Locked] ":""}{o.kind}: {o.text?.slice(0,18)||o.id.slice(0,8)}</button>)}
        </>}
        {inspectorTab==="properties" && <>
        {!item && <p className="rounded border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Select a text, shape, image, chart or table to edit its properties.</p>}
        {ids.length>1&&<p className="text-indigo-700">{ids.length} selected</p>}
        {ids.length>1&&!readOnly&&<div className="flex flex-wrap gap-1"><button type="button" className={field} disabled={locked} onClick={()=>commit(groupSceneObjects(scene,ids,()=>crypto.randomUUID()))}>Group</button><button type="button" className={field} disabled={locked} onClick={()=>commit(ungroupSceneObjects(scene,ids))}>Ungroup</button>
          {[-15,15].map(degrees=><button type="button" key={degrees} className={field} disabled={locked} onClick={()=>commit(rotateSceneSelection(scene,ids,degrees))}>Rotate {degrees}°</button>)}{[0.9,1.1].map(scale=><button type="button" key={scale} className={field} disabled={locked} onClick={()=>scaleSelection(scale)}>Scale {scale<1?"-10%":"+10%"}</button>)}
        </div>}
        {item&&<div className="flex flex-wrap gap-1">{(["left","center","right","top","middle","bottom"] as SceneAlign[]).map(direction=><button type="button" key={direction} className={field} disabled={readOnly||locked} onClick={()=>commit(alignSceneObjects(scene,ids,direction))}>{direction}</button>)}{ids.length>2&&(["x","y"] as const).map(axis=><button type="button" key={axis} className={field} disabled={readOnly||locked} onClick={()=>commit(distributeSceneObjects(scene,ids,axis))}>Distribute {axis==="x"?"H":"V"}</button>)}</div>}
        {item&&<><hr/><SlideSceneProperties key={item.id} object={item} readOnly={readOnly} onPatch={patch} onLock={value=>{if(!readOnly)commit(scenePatchObject(scene,item.id,{locked:value}));}} onEditText={()=>beginText(item.id)} onFormatText={()=>beginRichText(item.id)} onTimeline={()=>{setShowTimeline(true);}}/>
          <div className="flex flex-wrap gap-1"><button type="button" className={field} disabled={readOnly||locked||scene.objects.length>=120} onClick={duplicate}>Duplicate</button><button type="button" className={field} disabled={readOnly||locked} onClick={()=>commit(moveSceneSelectionLayer(scene,ids,-1))}>Back</button><button type="button" className={field} disabled={readOnly||locked} onClick={()=>commit(moveSceneSelectionLayer(scene,ids,1))}>Front</button><button type="button" className={field} disabled={readOnly||locked} onClick={remove}>Delete</button></div>
        </>}
        </>}
      </div></SlideSceneResizableInspector>}
    </div>
    {showTimeline && <div className="max-h-[36%] shrink-0 overflow-auto"><SlideSceneTimeline scene={scene} selected={selected} onSelect={select} onChange={next=>commit(next)} readOnly={readOnly} backgroundColor={backgroundColor}/></div>}
    {richEdit&&!readOnly&&<SlideSceneRichTextEditor key={richEdit.object.id} object={richEdit.object} backgroundColor={backgroundColor} onCancel={()=>setRichEdit(null)} onApply={richText=>{
      const current=scene.objects.find(o=>o.id===richEdit.object.id);if(!current||current.locked||sceneTextSignature(current)!==richEdit.signature)return false;
      const next=scenePatchObject(scene,current.id,{richText});if(JSON.stringify(next)!==JSON.stringify(scene)&&!commit(next))return false;setRichEdit(null);return true;
    }}/>}
  </div>;
}
