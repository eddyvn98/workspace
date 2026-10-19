import type { SlideScene } from "@/app/workspace/types/slideScene";
import { objectGroupPath, validSceneGroupHierarchy } from "@/app/workspace/types/slideSceneGroupPath";
import { unionSceneBounds } from "@/app/workspace/utils/slideSceneBounds";
import { emu, xml } from "./pptx-elements";
/** Contiguous hierarchy nodes become native grpSp recursively. Noncontiguous nodes flatten without changing paint order. */
export function groupPptxSceneShapes(scene:SlideScene,shapes:string[],scale:number):string[]{
  if(shapes.length!==scene.objects.length)throw new Error("Scene XML shape count mismatch.");
  if(!validSceneGroupHierarchy(scene.objects))throw new Error("Invalid scene group hierarchy.");
  const paths=scene.objects.map(objectGroupPath);let nextId=scene.objects.length+2;
  const visit=(start:number,end:number,depth:number):string[]=>{
    const positions=new Map<string,number[]>();
    for(let i=start;i<end;i++){const group=paths[i][depth];if(!group)continue;const list=positions.get(group)??[];list.push(i);positions.set(group,list);}
    const valid=new Map<number,{id:string;end:number}>();
    for(const [id,list] of positions)if(list[list.length-1]-list[0]+1===list.length)valid.set(list[0],{id,end:list[list.length-1]+1});
    const output:string[]=[];
    for(let i=start;i<end;i++){
      const group=valid.get(i);
      if(!group){output.push(shapes[i]);continue;}
      const bounds=unionSceneBounds(scene.objects.slice(i,group.end));
      if(!bounds)continue;
      const id=nextId++,x=emu(bounds.x*scale),y=emu(bounds.y*scale),w=emu(Math.max(1,bounds.w)*scale),h=emu(Math.max(1,bounds.h)*scale);
      const inner=visit(i,group.end,depth+1).join("");
      output.push(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${xml(group.id)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${inner}</p:grpSp>`);
      i=group.end-1;
    }
    return output;
  };
  return visit(0,shapes.length,0);
}
