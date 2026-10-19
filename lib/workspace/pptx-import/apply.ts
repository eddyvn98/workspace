import type { SlideDeckPayload, SlideMeta } from "@/app/workspace/types/slide";
import type { PptxImportResult, ImportAsset } from "./model";
/** Run only after the user accepts the compatibility report. Uploaded images reuse Workspace ACLs. */
export async function materializePptxImport(result: PptxImportResult, upload: (asset: ImportAsset) => Promise<string | null>, signal?: AbortSignal): Promise<SlideMeta[]> {
  signal?.throwIfAborted();
  const urls=new Map<string,string>();
  for (const asset of result.assets) {
    signal?.throwIfAborted();
    const url=await upload(asset);
    signal?.throwIfAborted();
    if(!url || !/^\/api\/workspace-images\/ws_[a-f0-9]+$/i.test(url))throw new Error(`Picture upload failed: ${asset.name}`);
    urls.set(asset.src,url);
  }
  return result.slides.map(slide=>{
    const groups=new Map<string,string>();
    const objects=slide.scene!.objects.map(object=>{
      const copy={...object,id:crypto.randomUUID()};
      if(object.groupId){if(!groups.has(object.groupId))groups.set(object.groupId,crypto.randomUUID());copy.groupId=groups.get(object.groupId);}
      if(object.kind==="image") {const url=urls.get(object.src || "");if(!url)throw new Error("Unresolved embedded image");copy.src=url;}
      if(object.series)copy.series=object.series.map(s=>({...s}));
      return copy;
    });
    return {...slide,id:crypto.randomUUID(),scene:{...slide.scene!,objects}};
  });
}
/** Append only; never replace an existing slide or silently change the deck's aspect ratio. */
export function appendImportedSlides(current: SlideDeckPayload, expected: string, ratio: "16:9" | "4:3", slides: SlideMeta[]): SlideDeckPayload {
  if(JSON.stringify(current)!==expected)throw new Error("The deck changed during import. Reopen the file to avoid overwriting edits.");
  if((current.aspectRatio || "16:9")!==ratio)throw new Error("The slide ratio changed during import");
  if(!slides.length || current.slideOrder.length+slides.length>60)throw new Error("The resulting deck must contain at most 60 slides");
  const known=new Set(Object.keys(current.slides));
  for(const slide of slides){if(known.has(slide.id))throw new Error("Duplicate imported slide id");known.add(slide.id);}
  return {...current,slideOrder:[...current.slideOrder,...slides.map(s=>s.id)],slides:{...current.slides,...Object.fromEntries(slides.map(s=>[s.id,s]))},activeSlideId:slides[0].id};
}
