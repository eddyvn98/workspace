import { createSceneDiagram, type SceneDiagram } from "@/app/workspace/utils/slideSceneDiagram";
import { withSceneGroupPath, objectGroupPath } from "@/app/workspace/types/slideSceneGroupPath";
import { appendObjects } from "./model";
import { child, children, descendants, elements, first, numeric, NS } from "./xml";
import { frame, transform, type Matrix } from "./geometry";
import { descendSmartArt } from "./diagram-guard";
import type { ObjectContext } from "./objects";
export const DIAGRAM_NS="http://schemas.openxmlformats.org/drawingml/2006/diagram";
export const DIAGRAM_DRAWING_NS="http://schemas.microsoft.com/office/drawing/2008/diagram";
type Reader=(tree:Element|undefined,parent:Matrix,ctx:ObjectContext,groupId?:string,depth?:number,path?:string[])=>Promise<void>;
/** Remap structural namespaces in inert XML; imported markup never enters browser HTML. */
function presentationTree(source:Element):Element{
  const document=source.ownerDocument.implementation.createDocument(NS.p,"p:spTree",null);
  const copy=(node:Element):Element=>{
    const diagram=node.namespaceURI===DIAGRAM_DRAWING_NS,ns=diagram?NS.p:node.namespaceURI;
    const result=document.createElementNS(ns,diagram?`p:${node.localName}`:node.nodeName);
    for(const attr of Array.from(node.attributes)){
      if(attr.namespaceURI==="http://www.w3.org/2000/xmlns/")continue;
      if(attr.namespaceURI)result.setAttributeNS(attr.namespaceURI,attr.name,attr.value);else result.setAttribute(attr.name,attr.value);
    }
    for(const value of Array.from(node.childNodes)){
      if(value.nodeType===1)result.appendChild(copy(value as Element));
      else if(value.nodeType===3)result.appendChild(document.createTextNode(value.textContent??""));
    }
    return result;
  };
  for(const node of elements(source))document.documentElement.appendChild(copy(node));
  return document.documentElement;
}
export async function readSceneSmartArt(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext,readObjects:Reader):Promise<boolean>{
  const ids=first(node,DIAGRAM_NS,"relIds");if(!ids)return false;
  const dataRel=ctx.rels.get(ids.getAttributeNS(NS.r,"dm")??"");
  if(!dataRel||dataRel.external||!dataRel.type.endsWith("/diagramData")){
    ctx.notice("smartart-data","A linked or missing SmartArt data model was not fetched or executed.");return true;
  }
  const traversal=descendSmartArt(ctx,dataRel.target);
  ctx.archive.signal?.throwIfAborted();
  const data=await ctx.archive.xml(dataRel.target),extension=first(data,DIAGRAM_DRAWING_NS,"dataModelExt");
  const drawingId=extension?.getAttribute("relId"),relations=await ctx.archive.relationships(dataRel.target);
  const drawingRel=drawingId?relations.get(drawingId):undefined;
  if(drawingRel&&!drawingRel.external&&drawingRel.type.endsWith("/diagramDrawing")){
    const drawing=await ctx.archive.xml(drawingRel.target),tree=first(drawing,DIAGRAM_DRAWING_NS,"spTree");
    if(tree){
      const source=child(node,NS.p,"xfrm"),ext=child(source,NS.a,"ext"),sw=numeric(ext,"cx"),sh=numeric(ext,"cy");
      if(sw<=0||sh<=0)throw new Error("SmartArt frame lacks valid source dimensions.");
      const cloned=presentationTree(tree),root:Matrix=[matrix[0]/sw,matrix[1]/sw,matrix[2]/sh,matrix[3]/sh,matrix[4],matrix[5]];
      const local=transform(child(child(cloned,NS.p,"grpSpPr"),NS.a,"xfrm"),root,true)??root;
      const before=ctx.objects.length,ownGroup=ctx.nextId();
      await readObjects(cloned,local,{...ctx,...traversal,rels:await ctx.archive.relationships(drawingRel.target),placeholders:[],onImported:undefined},ownGroup,1,[ownGroup]);
      if(ctx.objects.length>before){
        ctx.notice("smartart-editable","SmartArt's saved drawing was imported as editable grouped text/vector/image/connector objects. Native SmartArt layout rules are not retained.");
        if(descendants(tree,DIAGRAM_DRAWING_NS,"txXfrm").length)ctx.notice("smartart-text-transform","Independent SmartArt text transforms need visual review after conversion.");
        return true;
      }
    }
  }
  // No usable cache: retain semantic content using a clearly reported editable diagram layout.
  const points=children(first(data,DIAGRAM_NS,"ptLst"),DIAGRAM_NS,"pt").filter(pt=>["node","asst"].includes(pt.getAttribute("type")??"node"));
  const useful=points.map((pt,index)=>({source:pt.getAttribute("modelId")??String(index),id:`node-${index}`,label:descendants(pt,NS.a,"t").map(t=>t.textContent??"").join(" ")})).filter(p=>p.label.trim());
  if(!useful.length){ctx.notice("smartart-empty","SmartArt has no saved drawing or supported semantic text.");return true;}
  if(useful.length>24||useful.some(n=>n.label.length>1000))throw new Error("SmartArt fallback exceeds editable graph limits; save a cached drawing in PowerPoint first.");
  if(new Set(useful.map(n=>n.source)).size!==useful.length)throw new Error("SmartArt contains duplicate semantic node identifiers.");
  const mapping=new Map(useful.map(n=>[n.source,n.id]));
  const edges=children(first(data,DIAGRAM_NS,"cxnLst"),DIAGRAM_NS,"cxn").filter(e=>(e.getAttribute("type")??"parOf")==="parOf").flatMap(e=>{
    const from=mapping.get(e.getAttribute("srcId")??""),to=mapping.get(e.getAttribute("destId")??"");return from&&to?[{from,to}]:[];
  });
  if(edges.length>48)throw new Error("SmartArt fallback has too many connections.");
  const bounds=frame(matrix,ctx.notice),graph:SceneDiagram={version:1,layout:edges.length?"hierarchy":"process",nodes:useful.map(({id,label})=>({id,label})),edges,color:ctx.theme.colors.accent1??"#2563EB"};
  const output=createSceneDiagram(graph,bounds,ctx.nextId),angle=bounds.rotation*Math.PI/180,cx=bounds.x+bounds.w/2,cy=bounds.y+bounds.h/2;
  for(let i=0;i<output.length;i++){
    const object=output[i],dx=object.x+object.w/2-cx,dy=object.y+object.h/2-cy;
    object.x=cx+dx*Math.cos(angle)-dy*Math.sin(angle)-object.w/2;object.y=cy+dx*Math.sin(angle)+dy*Math.cos(angle)-object.h/2;object.rotation+=bounds.rotation;
    if(groupId)output[i]=withSceneGroupPath(object,[groupId,...objectGroupPath(object)]);
  }
  appendObjects(ctx.objects,output);
  ctx.notice("smartart-fallback","SmartArt had no usable saved drawing. Its text and parent connections were laid out as editable diagram primitives; the original visual layout is approximate.");
  return true;
}
