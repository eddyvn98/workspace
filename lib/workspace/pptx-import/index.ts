import { PptxArchive, PPTX_IMPORT_LIMITS } from "./archive";
import { child, children, descendants, elements, first, numeric, NS, type Relationship } from "./xml";
import { DEFAULT_THEME, type ImportAsset, type NoticeSink, type PptxImportResult } from "./model";
import { readObjects, type ObjectContext } from "./objects";
import { paint, readTheme } from "./style";
import type { Matrix } from "./geometry";
import type { SlideMeta } from "@/app/workspace/types/slide";
export type { PptxImportResult, ImportNotice, ImportAsset } from "./model";
const internal = (rels: Map<string,Relationship>, type: string) => [...rels.values()].find(r=>!r.external && r.type===`${NS.r}/${type}`)?.target;
async function optionalPart(archive: PptxArchive, rels: Map<string,Relationship>, type: string) {
  const path=internal(rels,type); return path ? {path,document:await archive.xml(path),rels:await archive.relationships(path)} : undefined;
}
function transition(document: Document, notice: NoticeSink): SlideMeta["transition"] {
  const t=child(document.documentElement,NS.p,"transition"), e=elements(t)[0];
  if (!e) return "none";
  if (e.localName==="fade") return "fade";
  if (e.localName==="push") return "slide";
  if (e.localName==="wipe") return "wipe";
  if (e.localName==="zoom") return "zoom";
  notice("transition",`Transition ${e.localName} was not imported.`); return "none";
}
/** Reads data only. No upload, Workspace mutation, embedded-code execution or external fetch. */
export async function parsePptx(bytes: Uint8Array, filename: string, options: { aspectRatio?: "16:9" | "4:3"; signal?: AbortSignal } = {}): Promise<PptxImportResult> {
  if (!/\.pptx$/i.test(filename)) throw new Error("Choose a .pptx file (not .ppt, .pptm or a password-protected file)");
  const archive=await PptxArchive.open(bytes,options.signal);
  const types=await archive.xml("[Content_Types].xml");
  if (!Array.from(types.getElementsByTagNameNS("*","Override")).some(e=>e.getAttribute("ContentType")==="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml")) throw new Error("The file is not a supported PPTX presentation");
  const presentationPath=internal(await archive.relationships(""),"officeDocument");
  if (!presentationPath) throw new Error("Presentation relationship is missing");
  const document=await archive.xml(presentationPath), rels=await archive.relationships(presentationPath);
  if (document.documentElement.namespaceURI!==NS.p) throw new Error("Strict Open XML presentations are not supported. Save a standard .pptx copy first.");
  const size=child(document.documentElement,NS.p,"sldSz"), width=numeric(size,"cx"), height=numeric(size,"cy");
  if (width<=0 || height<=0) throw new Error("Presentation has no valid slide dimensions");
  const ratio=options.aspectRatio || (Math.abs(width/height-4/3)<Math.abs(width/height-16/9)?"4:3":"16:9");
  const targetWidth=1280,targetHeight=ratio==="4:3"?960:720, scale=Math.min(targetWidth/width,targetHeight/height);
  const root: Matrix=[scale,0,0,scale,(targetWidth-width*scale)/2,(targetHeight-height*scale)/2];
  const result:PptxImportResult={title:filename.replace(/\.pptx$/i,"").slice(0,120),aspectRatio:ratio,slides:[],assets:[],notices:[]};
  const warning=(slide?:number):NoticeSink=>{const seen=new Set<string>();return (code,message)=>{
    const key=code+message;if(seen.has(key))return;seen.add(key);
    if(result.notices.length>=500)throw new Error("Too many unsupported features. Import a simpler PowerPoint copy first.");
    result.notices.push({slide,code,message});
  };};
  const general=warning();
  if (Math.abs(width/height-targetWidth/targetHeight)>0.005) general("aspect-ratio",`Source slides will be fitted without stretching inside ${ratio}; unused margins are expected.`);
  if ([...archive.entries.keys()].some(p=>/vbaProject|\/activeX\/|\.bin$/i.test(p))) general("embedded-code","Embedded macros, OLE and ActiveX data are ignored and never executed.");
  const slideIds=children(child(document.documentElement,NS.p,"sldIdLst"),NS.p,"sldId");
  if (!slideIds.length || slideIds.length>PPTX_IMPORT_LIMITS.slides) throw new Error("Import supports 1-60 slides per PPTX");
  const assets=new Map<string,ImportAsset>();
  for (let index=0;index<slideIds.length;index++) {
    options.signal?.throwIfAborted();
    const rel=rels.get(slideIds[index].getAttributeNS(NS.r,"id") || "");
    if (!rel || rel.external || rel.type!==`${NS.r}/slide`) throw new Error(`Invalid slide relationship at position ${index+1}`);
    const slideDocument=await archive.xml(rel.target), slideRels=await archive.relationships(rel.target), notice=warning(index+1);
    if ([...slideRels.values()].some(r=>r.external)) notice("external-resource", "External relationships were not fetched or activated.");
    const layout=await optionalPart(archive,slideRels,"slideLayout");
    const master=layout && await optionalPart(archive,layout.rels,"slideMaster");
    const themePart=master && await optionalPart(archive,master.rels,"theme");
    const theme=themePart?readTheme(themePart.document):{...DEFAULT_THEME,colors:{...DEFAULT_THEME.colors}};
    const colorMap=master && child(master.document.documentElement,NS.p,"clrMap");
    for (const key of ["bg1","bg2","tx1","tx2","accent1","accent2","accent3","accent4","accent5","accent6"]) {
      const mapped=colorMap?.getAttribute(key); if(mapped && theme.colors[mapped])theme.colors[key]=theme.colors[mapped];
    }
    const cSld=child(slideDocument.documentElement,NS.p,"cSld"), tree=child(cSld,NS.p,"spTree");
    if (!tree) throw new Error(`Slide ${index+1} has no shape tree`);
    const objects: NonNullable<SlideMeta["scene"]>["objects"]=[];
    let seq=0;
    const ctx:ObjectContext={archive,rels:slideRels,assets,theme,rootScale:scale,notice,objects,nextId:()=>`pptx-${index+1}-${++seq}`,placeholders:[...descendants(layout?.document,NS.p,"sp"),...descendants(master?.document,NS.p,"sp")].filter(n=>first(n,NS.p,"ph"))};
    if (!["0","false"].includes(slideDocument.documentElement.getAttribute("showMasterSp") || "")) {
      // Import static master/layout decorations, not inherited placeholders (which would duplicate slide text).
      for (const part of [master,layout]) if(part) {
        const inheritedTree=child(child(part.document.documentElement,NS.p,"cSld"),NS.p,"spTree");
        if (inheritedTree) {
          const copy=inheritedTree.cloneNode(true) as Element;
          for (const node of [...descendants(copy,NS.p,"sp"),...descendants(copy,NS.p,"pic"),...descendants(copy,NS.p,"graphicFrame")]) if(first(node,NS.p,"ph"))node.parentNode?.removeChild(node);
          await readObjects(copy,root,{...ctx,rels:part.rels,placeholders:[]});
        }
      }
    }
    await readObjects(tree,root,ctx);
    if (first(slideDocument,NS.p,"timing"))notice("animation","Object animations were not imported. Reapply them with the Workspace timeline.");
    if (first(slideDocument,NS.a,"hlinkClick"))notice("hyperlink","Links and click actions are not activated in imported content.");
    let backgroundColor="#FFFFFF";
    for (const part of [master?.document,layout?.document,slideDocument]) {
      const bg=child(child(part?.documentElement,NS.p,"cSld"),NS.p,"bg");
      if (bg) { const props=child(bg,NS.p,"bgPr"); backgroundColor=paint(props,theme,backgroundColor); if(!props || first(bg,NS.a,"gradFill") || first(bg,NS.a,"blipFill"))notice("background","An inherited/image/gradient background needs visual review."); }
    }
    const notesPart=await optionalPart(archive,slideRels,"notesSlide");
    const notes=descendants(notesPart?.document,NS.p,"sp").filter(n=>{const p=first(n,NS.p,"ph");return !p || p.getAttribute("type")==="body";}).map(n=>descendants(n,NS.a,"t").map(t=>t.textContent || "").join("\n")).join("\n");
    if(notes.length>20000)throw new Error(`Slide ${index+1} notes exceed 20,000 characters`);
    result.slides.push({id:`pptx-slide-${index+1}`,name:(cSld?.getAttribute("name") || `Slide ${index+1}`).slice(0,120),html:"",scene:{version:2,width:targetWidth,height:targetHeight,objects},backgroundColor,presenterNotes:notes,transition:transition(slideDocument,notice),hidden:["0","false"].includes(slideDocument.documentElement.getAttribute("show") || "")});
  }
  result.assets=[...assets.values()]; return result;
}
