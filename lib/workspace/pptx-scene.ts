import { color, emu, xml } from "./pptx-elements";
import type { SlideScene } from "@/app/workspace/types/slideScene";
import { exportSceneRichText } from "./pptx-scene-text";
import { sceneShapeGeometry } from "./pptx-scene-vector";

/** Native OOXML shapes keep geometry, rich text runs and custom vectors editable in PowerPoint. */
export function exportSceneShape(obj: SlideScene["objects"][number], id: number, scale: number): string {
  const { x, y, w, h } = obj, p = (v: number) => emu(v * scale);
  if (obj.kind === "text") return exportSceneRichText(obj, id, scale);
  const alpha = Math.round(Math.max(0, Math.min(1, obj.opacity ?? 1)) * 100000);
  const fill = obj.fill === "transparent" || obj.shapeKind === "line" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${color(obj.fill,"4F46E5")}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
  const stroke = !obj.stroke || obj.stroke === "transparent" || obj.strokeWidth === 0 ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${color(obj.stroke,"4F46E5")}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
  const rotation = Math.round((obj.rotation || 0) * 60000);
  const dash = obj.strokeDash === "dash" ? "dash" : obj.strokeDash === "dot" ? "dot" : "solid";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${xml(obj.id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="${rotation}"><a:off x="${p(x)}" y="${p(y)}"/><a:ext cx="${p(w)}" cy="${p(h)}"/></a:xfrm>${sceneShapeGeometry(obj)}${fill}<a:ln w="${p(obj.strokeWidth ?? 2)}">${stroke}<a:prstDash val="${dash}"/><a:round/></a:ln></p:spPr></p:sp>`;
}
