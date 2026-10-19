import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { child, first, numeric, NS } from "./xml";
import { frame, type Matrix } from "./geometry";
import { appendObjects } from "./model";
import { loadAsset } from "./media";
import { pictureOpacity, readPictureMask, readScenePaint } from "./paint-effects";
import type { ObjectContext } from "./objects";
export async function readScenePicture(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):Promise<void>{
  if(first(node,NS.a,"videoFile")||first(node,NS.a,"audioFile"))ctx.notice("media","Embedded audio/video is not activated; only its poster picture is imported.");
  const blip=first(node,NS.a,"blip"),rel=ctx.rels.get(blip?.getAttributeNS(NS.r,"embed")||blip?.getAttributeNS(NS.r,"link")||"");
  if(!rel||rel.external||!rel.type.endsWith("/image")){ctx.notice("external-image","A linked or missing picture was omitted; no remote URL was fetched.");return;}
  const asset=await loadAsset(ctx.archive,rel.target,ctx.assets,ctx.notice);if(!asset)return;
  const crop=first(node,NS.a,"srcRect"),l=numeric(crop,"l")/100000,r=numeric(crop,"r")/100000,t=numeric(crop,"t")/100000,b=numeric(crop,"b")/100000;
  const hasCrop=!!(l||r||t||b),geometry=frame(matrix,ctx.notice);
  let imageFit:SlideSceneObject["imageFit"]=hasCrop?"cover":"fill",imageFocusX=l+r>0?Math.max(0,Math.min(1,l/(l+r))):0.5,imageFocusY=t+b>0?Math.max(0,Math.min(1,t/(t+b))):0.5;
  if(Math.min(l,r,t,b)<0||l+r>=1||t+b>=1)ctx.notice("image-crop","An extended/invalid source crop was replaced with a cover fit.");
  else if(hasCrop){
    const visibleRatio=asset.width*(1-l-r)/(asset.height*(1-t-b));
    if(l+r>0&&t+b>0||Math.abs(visibleRatio-geometry.w/geometry.h)>0.03)ctx.notice("image-crop","A custom two-axis crop was approximated with cover fit; verify the focal point.");
  }
  const fillRect=child(first(node,NS.a,"stretch"),NS.a,"fillRect");
  const fl=numeric(fillRect,"l")/100000,fr=numeric(fillRect,"r")/100000,ft=numeric(fillRect,"t")/100000,fb=numeric(fillRect,"b")/100000;
  if(!hasCrop&&(fl||fr||ft||fb)){
    const ratio=geometry.w*(1-fl-fr)/(geometry.h*(1-ft-fb));
    if(Math.min(fl,fr,ft,fb)>=0&&fl+fr<1&&ft+fb<1&&Math.abs(ratio-asset.width/asset.height)<0.03){
      imageFit="contain";imageFocusX=fl+fr>0?fl/(fl+fr):0.5;imageFocusY=ft+fb>0?ft/(ft+fb):0.5;
    }else ctx.notice("image-placement","A custom destination image fill rectangle was approximated; review placement.");
  }
  const props=child(node,NS.p,"spPr"),sourceWidth=numeric(child(child(props,NS.a,"xfrm"),NS.a,"ext"),"cx");
  const scale=sourceWidth>0?Math.hypot(matrix[0],matrix[1])/sourceWidth:ctx.rootScale;
  const effects=readScenePaint(props,ctx.theme,scale,ctx.notice),imageMask=readPictureMask(props,geometry,scale,ctx.notice);
  appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"image",...geometry,src:asset.src,groupId,imageFit,imageFocusX,imageFocusY,opacity:pictureOpacity(node),...(effects.shadow?{shadow:effects.shadow}:{}),...(imageMask?{imageMask}:{})}]);
}
