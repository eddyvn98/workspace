import { color, emu, imageShape, textShape, xml } from "./pptx-elements";
import type { SlideScene } from "@/app/workspace/types/slideScene";

/** Native OOXML shapes keep the geometry and text editable in PowerPoint. */
export function exportSceneShape(obj: SlideScene["objects"][number], id: number, scale: number): string {
  const {x,y,w,h} = obj, p = (v:number) => emu(v*scale);
  if (obj.kind === "text") {
    const text = textShape(id,obj.text || "",x*scale,y*scale,w*scale,h*scale,(obj.fontSize||44)*scale,color(obj.color,"0F172A"),obj.fontFamily || "Arial",obj.fontWeight==="bold");
    return text.replace("<a:xfrm>",`<a:xfrm rot="${Math.round((obj.rotation || 0)*60000)}">`);
  }
  const fill = color(obj.fill,"4F46E5");
  const stroke = color(obj.stroke,"4F46E5");
  const rotation = Math.round((obj.rotation || 0) * 60000);
  const shape = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${xml(obj.id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="${rotation}"><a:off x="${p(x)}" y="${p(y)}"/><a:ext cx="${p(w)}" cy="${p(h)}"/></a:xfrm><a:prstGeom prst="${obj.radius ? "roundRect":"rect"}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill></a:ln></p:spPr></p:sp>`;
  return shape;
}
