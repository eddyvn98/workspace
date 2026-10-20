import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { withSceneGroupPath, objectGroupPath } from "@/app/workspace/types/slideSceneGroupPath";
import { child, elements, first, numeric, NS, type Relationship } from "./xml";
import { frame, transform, subFrame, type Matrix } from "./geometry";
import { appendObjects, type ImportAsset, type NoticeSink, type Theme } from "./model";
import { paint, readText, opacity } from "./style";
import { PptxArchive } from "./archive";
import { readNativeTable } from "./table";
import { readSceneShape } from "./shape";
import { readScenePaint } from "./paint-effects";
import { readScenePicture } from "./picture";
import { readSceneChart } from "./chart";
import { readSceneSmartArt } from "./smartart";
import { readSceneConnector } from "./connector";
export type ObjectContext={
  archive:PptxArchive;rels:Map<string,Relationship>;assets:Map<string,ImportAsset>;theme:Theme;rootScale:number;notice:NoticeSink;objects:SlideSceneObject[];
  nextId:()=>string;placeholders:Element[];onImported?:(source:Element,objects:SlideSceneObject[])=>void;
  diagramDepth?:number;diagramParts?:readonly string[];
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
  const fallback=paint(first(first(props,NS.a,"gsLst"),NS.a,"gs"),ctx.theme,"transparent"),id=ctx.nextId();
  const fill=paint(props,ctx.theme,fallback),stroke=paint(child(props,NS.a,"ln"),ctx.theme,"transparent");
  const source=child(props,NS.a,"xfrm")||child(shapeProperties(inherited(node,ctx)||node),NS.a,"xfrm"),ext=child(source,NS.a,"ext");
  const sw=numeric(ext,"cx",geometry.w/ctx.rootScale),sh=numeric(ext,"cy",geometry.h/ctx.rootScale),fontScale=sw>0?Math.hypot(matrix[0],matrix[1])/sw:ctx.rootScale;
  const shapeFields=readSceneShape(props,geometry,fontScale,ctx.notice),effects=readScenePaint(props,ctx.theme,fontScale,ctx.notice),ownOpacity=opacity(props),output:SlideSceneObject[]=[];
  const shadow=effects.shadow?{...effects.shadow,opacity:Math.min(1,effects.shadow.opacity/(ownOpacity||1))}:undefined;
  if(fill!=="transparent"||stroke!=="transparent"||effects.gradient||!body)output.push({id:`${id}-shape`,kind:"shape",...geometry,...shapeFields,...effects,shadow,fill,stroke,opacity:ownOpacity,groupId});
  if(body){
    if(placeholder(node)&&!first(body,NS.a,"rPr")?.hasAttribute("sz"))ctx.notice("placeholder-style","Inherited placeholder text styling requires visual review.");
    const bp=child(body,NS.a,"bodyPr"),left=numeric(bp,"lIns",91440),right=numeric(bp,"rIns",91440),top=numeric(bp,"tIns",45720),bottom=numeric(bp,"bIns",45720);
    const tx=subFrame(matrix,left/sw,top/sh,Math.max(0.01,1-(left+right)/sw),Math.max(0.01,1-(top+bottom)/sh)),text=readText(body,ctx.theme,fontScale,ctx.notice);
    const textShadow=effects.shadow?{...effects.shadow,opacity:Math.min(1,effects.shadow.opacity/(text.opacity||1))}:undefined;
    if(text.text)output.push({id:`${id}-text`,kind:"text",...frame(tx,ctx.notice),...text,...(!output.length&&textShadow?{shadow:textShadow}:{}),groupId});
  }
  if(output.length>1&&!groupId)for(const object of output)object.groupId=id;
  appendObjects(ctx.objects,output);
}
async function graphic(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):Promise<void>{
  const table=first(node,NS.a,"tbl");if(table){appendObjects(ctx.objects,[readNativeTable(table,matrix,groupId,ctx)]);return;}
  if(await readSceneSmartArt(node,matrix,groupId,ctx,readObjects))return;
  await readSceneChart(node,matrix,groupId,ctx);
}
/** Native coordinate transforms become scene geometry; hierarchy and embedded drawing data remain editable. */
export async function readObjects(tree:Element|undefined,parent:Matrix,ctx:ObjectContext,groupId?:string,depth=0,path:string[]=groupId?[groupId]:[]):Promise<void>{
  if(depth>16||path.length>16)throw new Error("PPTX group nesting limit exceeded");
  for(const node of elements(tree)){
    ctx.archive.signal?.throwIfAborted();
    if(node.namespaceURI!==NS.p){if(node.localName==="AlternateContent")ctx.notice("alternate-content","Alternative drawing content was omitted.");continue;}
    if(["nvGrpSpPr","grpSpPr","extLst"].includes(node.localName))continue;
    const before=ctx.objects.length;
    if(node.localName==="grpSp"){
      const matrix=transform(child(child(node,NS.p,"grpSpPr"),NS.a,"xfrm"),parent,true);
      if(!matrix){ctx.notice("group-transform","A group with invalid transform was omitted.");continue;}
      const nextPath=[...path,ctx.nextId()];await readObjects(node,matrix,ctx,nextPath[0],depth+1,nextPath);ctx.onImported?.(node,ctx.objects.slice(before));continue;
    }
    if(node.localName==="cxnSp")readSceneConnector(node,parent,groupId,ctx);
    else{
      const matrix=objectMatrix(node,parent,ctx);
      if(!matrix){ctx.notice("object-position",`Object ${node.localName} lacks supported position data and was omitted.`);continue;}
      if(node.localName==="sp")shape(node,matrix,groupId,ctx);
      else if(node.localName==="pic")await readScenePicture(node,matrix,groupId,ctx);
      else if(node.localName==="graphicFrame")await graphic(node,matrix,groupId,ctx);
      else ctx.notice("object-kind",`Unsupported object ${node.localName} was omitted.`);
    }
    if(path.length){
      const compound=ctx.objects.length-before>1?ctx.nextId():undefined;
      for(let i=before;i<ctx.objects.length;i++){
        const current=objectGroupPath(ctx.objects[i]),suffix=current[0]===groupId?current.slice(1):current;
        const next=[...path,...(suffix.length?suffix:compound?[compound]:[])];
        if(next.length>16)throw new Error("Imported nested group exceeds 16 levels.");
        ctx.objects[i]=withSceneGroupPath(ctx.objects[i],next);
      }
    }
    ctx.onImported?.(node,ctx.objects.slice(before));
  }
}
