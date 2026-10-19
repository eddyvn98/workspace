import { color, emu, textShape, xml } from "./pptx-elements";
import type { SlideScene } from "@/app/workspace/types/slideScene";

/** Native OOXML shapes keep the geometry and text editable in PowerPoint. */
export function exportSceneShape(obj: SlideScene["objects"][number], id: number, scale: number): string {
  const { x, y, w, h } = obj, p = (v: number) => emu(v * scale);
  const alpha = Math.round(Math.max(0, Math.min(1, obj.opacity ?? 1)) * 100000);
  if (obj.kind === "text") {
    // Scene font sizes are CSS pixels; DrawingML sz is hundredths of a point.
    const text = textShape(id, obj.text || "", x*scale, y*scale, w*scale, h*scale, (obj.fontSize || 44)*scale*0.75, color(obj.color,"0F172A"), obj.fontFamily || "Arial", obj.fontWeight === "bold", obj.rotation || 0);
    const align = obj.align === "center" ? "ctr" : obj.align === "right" ? "r" : "l";
    return text.replace(/<a:pPr\/>/g, `<a:pPr algn="${align}"><a:lnSpc><a:spcPct val="112000"/></a:lnSpc></a:pPr>`)
      .replace(/<a:srgbClr val="([A-Fa-f0-9]+)"\/>/g, `<a:srgbClr val="$1"><a:alpha val="${alpha}"/></a:srgbClr>`);
  }
  const fill = obj.fill === "transparent" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${color(obj.fill,"4F46E5")}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
  const stroke = !obj.stroke || obj.stroke === "transparent" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${color(obj.stroke,"4F46E5")}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
  const rotation = Math.round((obj.rotation || 0) * 60000);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${xml(obj.id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="${rotation}"><a:off x="${p(x)}" y="${p(y)}"/><a:ext cx="${p(w)}" cy="${p(h)}"/></a:xfrm><a:prstGeom prst="${obj.radius ? "roundRect" : "rect"}"><a:avLst/></a:prstGeom>${fill}<a:ln>${stroke}</a:ln></p:spPr></p:sp>`;
}
