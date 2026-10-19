import type { SlideScene } from "@/app/workspace/types/slideScene";
import { emu, xml } from "./pptx-elements";

/**
 * Wrap contiguous logical groups into native PowerPoint group shapes.
 * Noncontiguous group members remain separate to preserve exact scene z-order.
 * Identity transform maps children's slide-space geometry into the group frame.
 */
export function groupPptxSceneShapes(scene: SlideScene, shapes: string[], scale: number): string[] {
  if (shapes.length !== scene.objects.length) throw new Error("Scene XML shape count mismatch.");
  const groups = new Map<string, number[]>();
  for (const [index, object] of scene.objects.entries()) {
    if (!object.groupId) continue;
    const positions = groups.get(object.groupId) ?? [];
    positions.push(index);
    groups.set(object.groupId,positions);
  }
  const valid = new Map<number, { groupId: string; end: number }>();
  for (const [groupId, positions] of groups) {
    const start = positions[0], end = positions[positions.length-1];
    if (positions.length < 2 || end-start+1 !== positions.length) continue;
    valid.set(start,{groupId,end});
  }
  const output: string[] = [];
  for (let i=0;i<shapes.length;i++) {
    const group = valid.get(i);
    if (!group) {output.push(shapes[i]);continue;}
    const members = scene.objects.slice(i,group.end+1);
    const left = Math.min(...members.map(o=>o.x));
    const top = Math.min(...members.map(o=>o.y));
    const right = Math.max(...members.map(o=>o.x+o.w));
    const bottom = Math.max(...members.map(o=>o.y+o.h));
    const x=emu(left*scale),y=emu(top*scale);
    const w=emu(Math.max(1,right-left)*scale),h=emu(Math.max(1,bottom-top)*scale);
    // Child shape xfrm positions remain in slide-space; matching off/chOff gives identity scaling.
    const groupId = scene.objects.length+2+i;
    output.push(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${groupId}" name="Group ${xml(group.groupId)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${shapes.slice(i,group.end+1).join("")}</p:grpSp>`);
    i=group.end;
  }
  return output;
}
