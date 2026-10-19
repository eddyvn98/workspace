import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { child, children, descendants, elements, first, numeric, NS, type Relationship } from "./xml";
import { frame, transform, subFrame, type Matrix } from "./geometry";
import { appendObjects, type ImportAsset, type NoticeSink, type Theme } from "./model";
import { paint, readText, opacity } from "./style";
import { PptxArchive } from "./archive";
import { readNativeTable } from "./table";
import { readSceneShape } from "./shape";
import { readScenePaint } from "./paint-effects";
import { readScenePicture } from "./picture";
export type ObjectContext={
  archive:PptxArchive;rels:Map<string,Relationship>;assets:Map<string,ImportAsset>;
  theme:Theme;rootScale:number;notice:NoticeSink;objects:SlideSceneObject[];
  nextId:()=>string;placeholders:Element[];onImported?:(source:Element,objects:SlideSceneObject[])=>void;
};
function shapeProperties(node:Element):Element|undefined{return child(node,NS.p,"spPr");}
function placeholder(node:Element):Element|undefined{return first(node,NS.p,"ph");}
function inherited(node:Element,ctx:ObjectContext):Element|undefined{
  const ph=placeholder(node);if(!ph)return;
  return ctx.placeholders.find(n=>{const p=placeholder(n);return p&&(p.getAttribute("idx")||"0")===(ph.getAttribute("idx")||"0");});
}
function objectMatrix(node:Element,parent:Matrix,ctx:ObjectContext):Matrix|null{
  const direct=child(shapeProperties(node),NS.a,"xfrm")||child(node,NS.p,"xfrm"),fallback=inherited(node,ctx);
  return transform(direct||child(shapeProperties(fallback||node),NS.a,"xfrm"),parent);
}
function shape(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):void{
  const geometry=frame(matrix,ctx.notice),props=shapeProperties(node),body=child(node,NS.p,"txBody");
  const fallback=paint(first(first(props,NS.a,"gsLst"),NS.a,"gs"),ctx.theme,"transparent");
  const id=ctx.nextId(),fill=paint(props,ctx.theme,fallback),stroke=paint(child(props,NS.a,"ln"),ctx.theme,"transparent");
  const source=child(props,NS.a,"xfrm")||child(shapeProperties(inherited(node,ctx)||node),NS.a,"xfrm");
  const ext=child(source,NS.a,"ext"),sw=numeric(ext,"cx",geometry.w/ctx.rootScale),sh=numeric(ext,"cy",geometry.h/ctx.rootScale);
  const fontScale=sw>0?Math.hypot(matrix[0],matrix[1])/sw:ctx.rootScale;
  const shapeFields=readSceneShape(props,geometry,fontScale,ctx.notice),effects=readScenePaint(props,ctx.theme,fontScale,ctx.notice);
  const output:SlideSceneObject[]=[],ownOpacity=opacity(props);
  const shadow=effects.shadow?{...effects.shadow,opacity:Math.min(1,effects.shadow.opacity/(ownOpacity||1))}:undefined;
  if(fill!=="transparent"||stroke!=="transparent"||effects.gradient||!body)output.push({id:`${id}-shape`,kind:"shape",...geometry,...shapeFields,...effects,shadow,fill,stroke,opacity:ownOpacity,groupId});
  if(body){
    if(placeholder(node)&&!first(body,NS.a,"rPr")?.hasAttribute("sz"))ctx.notice("placeholder-style","Inherited placeholder text styling requires visual review.");
    const bp=child(body,NS.a,"bodyPr"),left=numeric(bp,"lIns",91440),right=numeric(bp,"rIns",91440),top=numeric(bp,"tIns",45720),bottom=numeric(bp,"bIns",45720);
    const tx=subFrame(matrix,left/sw,top/sh,Math.max(0.01,1-(left+right)/sw),Math.max(0.01,1-(top+bottom)/sh));
    const text=readText(body,ctx.theme,fontScale,ctx.notice);
    if(text.text)output.push({id:`${id}-text`,kind:"text",...frame(tx,ctx.notice),...text,...(!output.length&&effects.shadow?{shadow:effects.shadow}:{}),groupId});
  }
  if(output.length>1&&!groupId)for(const object of output)object.groupId=id;
  appendObjects(ctx.objects,output);
}
async function graphic(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):Promise<void>{
  const table=first(node,NS.a,"tbl");
  if(table){appendObjects(ctx.objects,[readNativeTable(table,matrix,groupId,ctx)]);return;}
  const reference=first(node,NS.c,"chart"),rel=ctx.rels.get(reference?.getAttributeNS(NS.r,"id")||"");
  if(!reference||!rel||rel.external||!rel.type.endsWith("/chart")){ctx.notice("graphic","An unsupported graphic, diagram or embedded object was omitted.");return;}
  const chart=await ctx.archive.xml(rel.target),series=descendants(chart,NS.c,"ser");
  const categoryCache=first(child(series[0],NS.c,"cat"),NS.c,"strCache")||first(child(series[0],NS.c,"cat"),NS.c,"numCache")||first(first(child(series[0],NS.c,"cat"),NS.c,"multiLvlStrCache"),NS.c,"lvl");
  const valueCache=first(child(series[0],NS.c,"val"),NS.c,"numCache");
  const categories=new Map(children(categoryCache,NS.c,"pt").map(e=>[numeric(e,"idx"),child(e,NS.c,"v")?.textContent||""]));
  const values=children(valueCache,NS.c,"pt").map(e=>({label:categories.get(numeric(e,"idx"))||String(numeric(e,"idx")+1),value:Number(child(e,NS.c,"v")?.textContent)}));
  if(series.length===1&&first(chart,NS.c,"barChart")&&values.length>0&&values.length<=24&&values.every(v=>Number.isFinite(v.value)&&v.value>=0&&v.value<=1e9)){
    ctx.notice("chart-style","Chart data was preserved as an editable bar chart; axis, legend and plot styling may differ.");
    appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"chart",...frame(matrix,ctx.notice),series:values,fill:paint(child(series[0],NS.c,"spPr"),ctx.theme,ctx.theme.colors.accent1),groupId}]);
  }else{
    const text=series.map((s,i)=>`Series ${i+1}: `+descendants(child(s,NS.c,"val"),NS.c,"v").map(v=>v.textContent||"").join(", ")).join("\n");
    ctx.notice("chart-data","An unsupported chart was converted to cached data text; the original chart is not reproduced.");
    appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"text",...frame(matrix,ctx.notice),text:text||"Chart has no cached data",fontSize:24,color:"#0f172a",groupId}]);
  }
}
export async function readObjects(tree:Element|undefined,parent:Matrix,ctx:ObjectContext,groupId?:string,depth=0):Promise<void>{
  if(depth>16)throw new Error("PPTX group nesting limit exceeded");
  for(const node of elements(tree)){
    ctx.archive.signal?.throwIfAborted();
    if(node.namespaceURI!==NS.p){if(node.localName==="AlternateContent")ctx.notice("alternate-content","Alternative drawing content was omitted.");continue;}
    if(["nvGrpSpPr","grpSpPr","extLst"].includes(node.localName))continue;
    const before=ctx.objects.length;
    if(node.localName==="grpSp"){
      const matrix=transform(child(child(node,NS.p,"grpSpPr"),NS.a,"xfrm"),parent,true);
      if(!matrix){ctx.notice("group-transform","A group with invalid transform was omitted.");continue;}
      if(groupId)ctx.notice("nested-group","Nested groups were flattened into their outer editable group.");
      await readObjects(node,matrix,ctx,groupId||ctx.nextId(),depth+1);ctx.onImported?.(node,ctx.objects.slice(before));continue;
    }
    const matrix=objectMatrix(node,parent,ctx);
    if(!matrix){ctx.notice("object-position",`Object ${node.localName} lacks supported position data and was omitted.`);continue;}
    if(node.localName==="sp")shape(node,matrix,groupId,ctx);
    else if(node.localName==="pic")await readScenePicture(node,matrix,groupId,ctx);
    else if(node.localName==="graphicFrame")await graphic(node,matrix,groupId,ctx);
    else ctx.notice("object-kind",`Unsupported object ${node.localName} was omitted.`);
    ctx.onImported?.(node,ctx.objects.slice(before));
  }
}
