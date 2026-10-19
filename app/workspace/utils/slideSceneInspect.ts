import type { SlideScene } from "../types/slideScene";
export type SlideSceneWarning = { objectId:string; code:"overflow"|"small-text"|"collision"|"contrast"|"missing-image"; message:string };
function parseHex(value?:string): [number,number,number]|null {
  if(!value || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16)];
}
function luminance(rgb:[number,number,number]) {
  const linear=rgb.map(v=>{const c=v/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
}
export function sceneContrast(foreground?:string,background?:string):number|null{
  const fg=parseHex(foreground),bg=parseHex(background);
  if(!fg||!bg)return null;
  const a=luminance(fg),b=luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
/** Lightweight deterministic preflight: warning-only, never silently changes AI content. */
export function inspectSlideScene(scene:SlideScene,background="#FFFFFF"):SlideSceneWarning[]{
  const warnings:SlideSceneWarning[]=[];
  for(const obj of scene.objects){
    if(obj.x < 0 || obj.y < 0 || obj.x+obj.w > scene.width || obj.y+obj.h > scene.height){
      warnings.push({objectId:obj.id,code:"overflow",message:"Object extends beyond slide bounds."});
    }
    if(obj.kind==="text" && obj.text?.trim()){
      if((obj.fontSize||44)<22) warnings.push({objectId:obj.id,code:"small-text",message:"Text may be too small to read in a presentation."});
      const contrast=sceneContrast(obj.color,background);
      if(contrast!==null && contrast<4.5) warnings.push({objectId:obj.id,code:"contrast",message:"Text/background contrast is below WCAG 4.5:1."});
    }
    if(obj.kind==="image" && !obj.src) warnings.push({objectId:obj.id,code:"missing-image",message:"Image has no source."});
  }
  for(let i=0;i<scene.objects.length;i++){
    const a=scene.objects[i];if(a.kind!=="text" || !a.text?.trim())continue;
    for(let j=i+1;j<scene.objects.length;j++){
      const b=scene.objects[j];if(b.kind!=="text" || !b.text?.trim())continue;
      const overlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      if(overlap>Math.min(a.w*a.h,b.w*b.h)*.2)warnings.push({objectId:a.id,code:"collision",message:`Text overlaps with ${b.id}; inspect composition.`});
    }
  }
  return warnings;
}
