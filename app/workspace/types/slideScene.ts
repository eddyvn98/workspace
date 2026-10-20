/** Shared, identity-neutral Scene V2. Legacy HTML and command/save contracts remain separate. */
import { MAX_OBJECT_EFFECTS, MAX_SCENE_EFFECTS, normalizeSceneMotion, type SceneMotion } from "./slideSceneMotion";
import { createSceneTable, normalizeSceneTable, type SceneTableData } from "./slideSceneTable";
import { inheritSceneTextStyle, normalizeSceneRichText, sceneRichTextPlainText, type SceneRichText } from "./slideSceneText";
import { normalizeSceneShape, type SceneShapeFields } from "./slideSceneShape";
import { normalizeScenePaint, type ScenePaintFields } from "./slideScenePaint";
import { defaultSceneChart, normalizeSceneChart, type SceneChartData } from "./slideSceneChart";
import { normalizeSceneGrouping, validSceneGroupHierarchy, type SceneGrouping } from "./slideSceneGroupPath";
export { normalizeSceneMotion } from "./slideSceneMotion";
export type { SceneMotion, SceneMotionKind, SceneMotionTrigger, SceneMotionPhase, SceneMotionEasing } from "./slideSceneMotion";
export type { SceneTableData, SceneTableCell, SceneTableMerge } from "./slideSceneTable";
export type { SceneRichText, SceneTextParagraph, SceneTextRun } from "./slideSceneText";
export type { SceneShapeKind, SceneVectorPath, ScenePathCommand } from "./slideSceneShape";
export type { SceneGradient, SceneShadow, SceneImageMask } from "./slideScenePaint";
export type { SceneChartData, SceneChartSeries, SceneChartType } from "./slideSceneChart";
export type SceneObjectKind="text"|"shape"|"image"|"chart"|"table";
export interface SlideSceneObject extends SceneShapeFields,ScenePaintFields,SceneGrouping{
  id:string;kind:SceneObjectKind;x:number;y:number;w:number;h:number;rotation:number;
  text?:string;richText?:SceneRichText;italic?:boolean;underline?:boolean;strike?:boolean;verticalAlign?:"top"|"middle"|"bottom";
  src?:string;imageFit?:"cover"|"contain"|"fill";imageFocusX?:number;imageFocusY?:number;
  /** Legacy chart data. chart is authoritative when present. */
  series?:Array<{label:string;value:number}>;chart?:SceneChartData;table?:SceneTableData;
  fill?:string;stroke?:string;color?:string;fontSize?:number;fontFamily?:string;fontWeight?:"normal"|"bold";align?:"left"|"center"|"right";
  radius?:number;opacity?:number;locked?:boolean;
  /** Legacy single effect. animations is authoritative when present, including an empty array. */
  motion?:SceneMotion;animations?:SceneMotion[];
}
export interface SlideScene{version:2;width:number;height:number;objects:SlideSceneObject[];}
const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
const color=(v:unknown,fallback:string)=>typeof v==="string"&&(/^#[0-9a-f]{3,8}$/i.test(v)||/^(?:rgb|rgba|hsl|hsla)\([\d\s,%.+-]+\)$/i.test(v)||/^[a-z]{2,20}$/i.test(v))?v:fallback;
export const slideSceneRatio=(ratio:"16:9"|"4:3"="16:9")=>({width:1280,height:ratio==="4:3"?960:720});
export function emptySlideScene(ratio:"16:9"|"4:3"="16:9"):SlideScene{return {version:2,...slideSceneRatio(ratio),objects:[]};}
export function normalizeSlideScene(input:unknown,ratio:"16:9"|"4:3"="16:9"):SlideScene|undefined{
  if(input===undefined||input===null)return;
  const r=record(input),size=slideSceneRatio(ratio);
  if(r.version!==2||!Array.isArray(r.objects)||r.objects.length>120)return;
  const seen=new Set<string>(),objects:SlideSceneObject[]=[];let effectCount=0;
  for(const [index,value] of r.objects.entries()){
    const obj=record(value);if(!["text","shape","image","chart","table"].includes(String(obj.kind)))return;
    const id=typeof obj.id==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(obj.id)?obj.id:`object-${index}`;
    if(seen.has(id))return;seen.add(id);const kind=obj.kind as SceneObjectKind;
    const src=typeof obj.src==="string"&&obj.src.length<2048&&/^(https?:\/\/|\/(?!\/))/i.test(obj.src)&&!/[\\\u0000-\u001f]/.test(obj.src)?obj.src:undefined;
    if(kind==="image"&&!src)return;
    const chart=kind==="chart"&&obj.chart!==undefined?normalizeSceneChart(obj.chart):undefined;
    if(kind==="chart"&&obj.chart!==undefined&&!chart)return;
    let series:Array<{label:string;value:number}>|undefined;
    if(kind==="chart"){
      if(chart)series=chart.categories.map((label,i)=>({label,value:chart.series[0].values[i]??0}));
      else{
        const raw=obj.series;if(!Array.isArray(raw)||raw.length<1||raw.length>24)return;
        series=[];
        for(const value of raw){const s=record(value);if(typeof s.value!=="number"||!Number.isFinite(s.value)||s.value<0||s.value>1e9)return;const label=String(s.label??"").slice(0,80);if(!label)return;series.push({label,value:s.value});}
      }
    }
    const table=kind==="table"?normalizeSceneTable(obj.table):undefined;if(kind==="table"&&!table)return;
    const shape=kind==="shape"?normalizeSceneShape(obj):undefined;if(kind==="shape"&&!shape)return;
    const paint=normalizeScenePaint(kind,obj),grouping=normalizeSceneGrouping(obj);if(!paint||!grouping)return;
    const richText=kind==="text"&&obj.richText!==undefined?normalizeSceneRichText(obj.richText):undefined;
    if(kind==="text"&&obj.richText!==undefined&&!richText)return;
    let animations:SceneMotion[]|undefined;
    if(obj.animations!==undefined){
      if(!Array.isArray(obj.animations)||obj.animations.length>MAX_OBJECT_EFFECTS)return;
      animations=[];
      for(const raw of obj.animations){if(!raw||typeof raw!=="object"||Array.isArray(raw))return;const motion=normalizeSceneMotion(raw);if(!motion)return;animations.push(motion);}
    }
    effectCount+=animations?.length??(obj.motion?1:0);if(effectCount>MAX_SCENE_EFFECTS)return;
    objects.push({
      id,kind,x:num(obj.x,100,-1280,2560),y:num(obj.y,100,-960,1920),w:num(obj.w,420,8,2560),h:num(obj.h,130,8,1920),rotation:num(obj.rotation,0,-360,360),
      ...(kind==="text"?{text:richText?sceneRichTextPlainText(richText):String(obj.text??"").slice(0,10000),...(richText?{richText}:{}),italic:obj.italic===true,underline:obj.underline===true,strike:obj.strike===true,verticalAlign:["top","middle","bottom"].includes(String(obj.verticalAlign))?obj.verticalAlign as SlideSceneObject["verticalAlign"]:"top"}:{}),
      ...(src&&kind==="image"?{src,imageFit:["cover","contain","fill"].includes(String(obj.imageFit))?obj.imageFit as SlideSceneObject["imageFit"]:"cover",imageFocusX:num(obj.imageFocusX,0.5,0,1),imageFocusY:num(obj.imageFocusY,0.5,0,1)}:{}),
      ...(series?{series}:{}),...(chart?{chart}:{}),...(table?{table}:{}),...(shape??{}),...paint,...grouping,
      fill:color(obj.fill,kind==="shape"?"#4f46e5":"transparent"),stroke:color(obj.stroke,"transparent"),color:color(obj.color,"#0f172a"),
      fontSize:num(obj.fontSize,kind==="table"?22:44,8,180),fontFamily:typeof obj.fontFamily==="string"&&/^[\w\s,'"-]{1,100}$/.test(obj.fontFamily)?obj.fontFamily:"Arial",
      fontWeight:obj.fontWeight==="bold"?"bold":"normal",align:["left","center","right"].includes(String(obj.align))?obj.align as SlideSceneObject["align"]:"left",
      radius:num(obj.radius,shape?.shapeKind==="roundRect"?Math.min(num(obj.w,420,8,2560),num(obj.h,130,8,1920))/6:0,0,200),opacity:num(obj.opacity,1,0,1),locked:obj.locked===true,
      ...(obj.motion!=null?{motion:normalizeSceneMotion(obj.motion)}:{}),...(animations!==undefined?{animations}:{})
    });
  }
  if(!validSceneGroupHierarchy(objects))return;
  return {version:2,...size,objects};
}
export function sceneObject(kind:SceneObjectKind,x=100,y=100):SlideSceneObject{
  const common={id:crypto.randomUUID(),kind,x,y,w:480,h:140,rotation:0,opacity:1};
  if(kind==="text")return {...common,text:"Edit this text",fontSize:48,fontWeight:"bold",color:"#0f172a",fontFamily:"Arial"};
  if(kind==="shape")return {...common,w:340,h:220,fill:"#4f46e5",radius:24};
  if(kind==="chart"){const chart=defaultSceneChart();return {...common,w:680,h:400,fill:"#2563eb",color:"#0f172a",chart,series:chart.categories.map((label,i)=>({label,value:chart.series[0].values[i]??0}))};}
  if(kind==="table")return {...common,w:900,h:360,table:createSceneTable(),fill:"#2563eb",color:"#0f172a",fontSize:22};
  return {...common,src:"",imageFit:"cover",imageFocusX:0.5,imageFocusY:0.5,w:460,h:280};
}
export function scenePatchObject(scene:SlideScene,id:string,patch:Partial<SlideSceneObject>):SlideScene{
  const objects=scene.objects.map(o=>{
    if(o.id!==id)return o;const next={...o,...patch,id:o.id,kind:o.kind};
    if(o.kind==="text"&&o.richText&&!Object.hasOwn(patch,"richText")){
      if(Object.hasOwn(patch,"text")&&patch.text!==o.text)delete next.richText;else next.richText=inheritSceneTextStyle(o.richText,patch);
    }
    if(o.kind==="chart"&&o.chart&&Object.hasOwn(patch,"series")&&!Object.hasOwn(patch,"chart"))delete next.chart;
    return next;
  });
  return normalizeSlideScene({...scene,objects},scene.height===960?"4:3":"16:9")??scene;
}
export function sceneDeleteObject(scene:SlideScene,id:string):SlideScene{return {...scene,objects:scene.objects.filter(o=>o.id!==id)};}
export function sceneMoveObject(scene:SlideScene,id:string,direction:-1|1):SlideScene{
  const objects=[...scene.objects],index=objects.findIndex(o=>o.id===id),next=index+direction;
  if(index<0||next<0||next>=objects.length)return scene;[objects[index],objects[next]]=[objects[next],objects[index]];return {...scene,objects};
}
