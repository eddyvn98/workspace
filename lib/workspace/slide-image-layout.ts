import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
export type ImageRect = {x:number;y:number;w:number;h:number};
export type SlideImageLayout = {rect:ImageRect;crop?:{l:number;r:number;t:number;b:number}};

/** Map CSS object-fit to editable OOXML source crop or contained image geometry. */
export function sceneImageLayout(rect:ImageRect, source:{width:number;height:number},fit:SlideSceneObject["imageFit"]="cover"):SlideImageLayout{
  if(source.width<=0||source.height<=0||rect.w<=0||rect.h<=0)return {rect};
  const imageRatio=source.width/source.height, boxRatio=rect.w/rect.h;
  if(fit==="fill")return {rect};
  if(fit==="contain"){
    const scale=Math.min(rect.w/source.width,rect.h/source.height);
    const w=source.width*scale,h=source.height*scale;
    return {rect:{x:rect.x+(rect.w-w)/2,y:rect.y+(rect.h-h)/2,w,h}};
  }
  if(imageRatio>boxRatio){
    const amount=Math.round((1-boxRatio/imageRatio)*50000);
    return {rect,crop:{l:amount,r:amount,t:0,b:0}};
  }
  if(imageRatio<boxRatio){
    const amount=Math.round((1-imageRatio/boxRatio)*50000);
    return {rect,crop:{l:0,r:0,t:amount,b:amount}};
  }
  return {rect};
}
