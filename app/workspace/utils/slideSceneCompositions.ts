import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { emptySlideScene, normalizeSlideScene } from "../types/slideScene";

export type SceneDesignStyle = "editorial" | "technology" | "minimal" | "playful";
type Design = { background:string; ink:string; accent:string; secondary:string; font:string };
export const SLIDE_SCENE_STYLES: Record<SceneDesignStyle,Design> = {
  editorial: {background:"#111827",ink:"#FFFFFF",accent:"#EF4444",secondary:"#334155",font:"Georgia"},
  technology: {background:"#0B1026",ink:"#F8FAFC",accent:"#38BDF8",secondary:"#312E81",font:"Arial"},
  minimal: {background:"#F7F4EF",ink:"#292524",accent:"#B45309",secondary:"#E7E5E4",font:"Georgia"},
  playful: {background:"#FFF7ED",ink:"#292524",accent:"#EA580C",secondary:"#FDE68A",font:"Arial"},
};
export type SceneComposition = "hero" | "split" | "metric" | "statement" | "columns";
export type SceneContent = { title:string; subtitle?:string; bullets?:string[]; imageUrl?:string; metric?:string; metricLabel?:string };
const safe = (input:string) => input.replace(/[\u0000-\u001f]/g," ").slice(0,6000);
const textObject=(id:string,text:string,x:number,y:number,w:number,h:number,size:number,color:string,font:string,bold=false):SlideSceneObject=>({
  id,kind:"text",x,y,w,h,rotation:0,text:safe(text),fontSize:size,color,fontFamily:font,fontWeight:bold?"bold":"normal",opacity:1
});
const rect=(id:string,x:number,y:number,w:number,h:number,fill:string,radius=0):SlideSceneObject=>({id,kind:"shape",x,y,w,h,rotation:0,fill,radius,opacity:1});

/** Compositions are editable scene primitives, not static background images. */
export function composeSlideScene(content:SceneContent,style:SceneDesignStyle,layout:SceneComposition):SlideScene {
  const theme=SLIDE_SCENE_STYLES[style], scene=emptySlideScene(),objects:SlideSceneObject[]=[];
  const push=(...parts:SlideSceneObject[])=>objects.push(...parts);
  if(layout==="hero"){
    push(rect("accent-line",80,110,12,500,theme.accent),textObject("title",content.title,125,130,1020,230,76,theme.ink,theme.font,true));
    if(content.subtitle)push(textObject("subtitle",content.subtitle,125,410,960,130,32,theme.ink,theme.font));
  } else if(layout==="split"){
    push(rect("panel",660,0,620,720,theme.secondary),textObject("title",content.title,78,110,520,225,62,theme.ink,theme.font,true));
    if(content.subtitle)push(textObject("subtitle",content.subtitle,78,380,520,185,28,theme.ink,theme.font));
    if(content.imageUrl && /^(https?:\/\/|\/(?!\/))/i.test(content.imageUrl))push({id:"visual",kind:"image",src:content.imageUrl,x:700,y:80,w:500,h:560,rotation:0});
    else push(rect("feature-shape",770,155,360,360,theme.accent,48));
  } else if(layout==="metric"){
    push(textObject("title",content.title,80,65,1050,120,50,theme.ink,theme.font,true),rect("rule",80,210,1120,6,theme.accent));
    push(textObject("metric",content.metric||"42%",95,280,900,215,150,theme.accent,theme.font,true));
    push(textObject("metric-label",content.metricLabel||content.subtitle||"",95,545,1000,88,33,theme.ink,theme.font));
  } else if(layout==="statement"){
    push(rect("top-bar",0,0,1280,32,theme.accent),textObject("statement",content.title,95,165,1100,330,85,theme.ink,theme.font,true));
    if(content.subtitle)push(textObject("caption",content.subtitle,100,550,960,110,26,theme.accent,theme.font));
  } else {
    push(textObject("title",content.title,80,70,1100,105,54,theme.ink,theme.font,true));
    const items=(content.bullets||[]).slice(0,3);
    for(let i=0;i<3;i++){
      const x=80+i*380;
      push(rect("card-"+i,x,230,350,400,theme.secondary,20),rect("card-accent-"+i,x+25,260,78,8,theme.accent),
        textObject("card-text-"+i,items[i]||"",x+25,320,300,255,36,theme.ink,theme.font,true));
    }
  }
  return normalizeSlideScene({...scene,objects},"16:9")!;
}
