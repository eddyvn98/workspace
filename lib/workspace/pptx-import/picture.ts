import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { EMPTY_IMAGE_INSETS, normalizeSceneImageInsets, type SceneImageInsets } from "@/app/workspace/types/slideSceneImageCrop";
import { child, first, numeric, NS } from "./xml";
import { frame, type Matrix } from "./geometry";
import { appendObjects } from "./model";
import { loadAsset } from "./media";
import { pictureOpacity, readPictureMask, readScenePaint } from "./paint-effects";
import type { ObjectContext } from "./objects";
function readInsets(node: Element | undefined): SceneImageInsets | undefined {
  const value = (key: string) => {
    const raw = node?.getAttribute(key); if (raw === null || raw === undefined) return 0;
    return raw.endsWith("%") ? Number(raw.slice(0,-1)) / 100 : Number(raw) / 100000;
  };
  return normalizeSceneImageInsets({left:value("l"),top:value("t"),right:value("r"),bottom:value("b")});
}
export async function readScenePicture(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):Promise<void>{
  if(first(node,NS.a,"videoFile")||first(node,NS.a,"audioFile"))ctx.notice("media","Embedded audio/video is not activated; only its poster picture is imported.");
  const blip=first(node,NS.a,"blip"),rel=ctx.rels.get(blip?.getAttributeNS(NS.r,"embed")||blip?.getAttributeNS(NS.r,"link")||"");
  if(!rel||rel.external||!rel.type.endsWith("/image")){ctx.notice("external-image","A linked or missing picture was omitted; no remote URL was fetched.");return;}
  const asset=await loadAsset(ctx.archive,rel.target,ctx.assets,ctx.notice);if(!asset)return;
  const sourceRect=first(node,NS.a,"srcRect"),fillRect=child(first(node,NS.a,"stretch"),NS.a,"fillRect");
  const sourceCrop=readInsets(sourceRect),destination=readInsets(fillRect),geometry=frame(matrix,ctx.notice);
  const crop=sourceCrop??EMPTY_IMAGE_INSETS,viewport=destination??EMPTY_IMAGE_INSETS;
  const hasCrop=Object.values(crop).some(v=>v!==0),hasPadding=Object.values(viewport).some(v=>v!==0);
  let imageFit:SlideSceneObject["imageFit"]=hasCrop?"cover":"fill";
  let imageFocusX=crop.left+crop.right?crop.left/(crop.left+crop.right):0.5;
  let imageFocusY=crop.top+crop.bottom?crop.top/(crop.top+crop.bottom):0.5;
  if(!sourceCrop){imageFit="cover";ctx.notice("image-crop","A source crop with outsets, nonfinite values or an empty visible region was replaced by cover fit.");}
  if(!destination)ctx.notice("image-placement","Destination image outsets or an empty destination rectangle were normalized to the outer frame.");
  if(!hasCrop&&hasPadding){
    const ratio=geometry.w*(1-viewport.left-viewport.right)/(geometry.h*(1-viewport.top-viewport.bottom));
    if(Math.abs(ratio-asset.width/asset.height)<0.03){
      imageFit="contain";imageFocusX=viewport.left+viewport.right?viewport.left/(viewport.left+viewport.right):0.5;
      imageFocusY=viewport.top+viewport.bottom?viewport.top/(viewport.top+viewport.bottom):0.5;
    }
  }
  const exact = !!sourceCrop && !!destination && (hasCrop||hasPadding);
  const props=child(node,NS.p,"spPr"),sourceWidth=numeric(child(child(props,NS.a,"xfrm"),NS.a,"ext"),"cx");
  const scale=sourceWidth>0?Math.hypot(matrix[0],matrix[1])/sourceWidth:ctx.rootScale;
  const effects=readScenePaint(props,ctx.theme,scale,ctx.notice),imageMask=readPictureMask(props,geometry,scale,ctx.notice),opacity=pictureOpacity(node);
  const shadow=effects.shadow?{...effects.shadow,opacity:Math.min(1,effects.shadow.opacity/(opacity||1))}:undefined;
  appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"image",...geometry,src:asset.src,groupId,imageFit,imageFocusX,imageFocusY,opacity,
    ...(exact?{imageCrop:{...crop},imageViewport:{...viewport}}:{}),...(shadow?{shadow}:{}),...(imageMask?{imageMask}:{})}]);
}
