import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import type { SceneGradient, SceneShadow } from "@/app/workspace/types/slideScenePaint";
import { emu, xml } from "./pptx-elements";
import { sceneShapeGeometry } from "./pptx-scene-vector";
import { sceneImageLayout } from "./slide-image-layout";
const alpha = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100000);
const rgb = (color: string, opacity: number) => `<a:srgbClr val="${color.slice(1).toUpperCase()}"><a:alpha val="${alpha(opacity)}"/></a:srgbClr>`;
export function sceneGradientXml(gradient: SceneGradient, opacity = 1): string {
  return `<a:gradFill rotWithShape="1"><a:gsLst>${gradient.stops.map(stop => `<a:gs pos="${Math.round(stop.offset * 100000)}">${rgb(stop.color, stop.opacity * opacity)}</a:gs>`).join("")}</a:gsLst><a:lin ang="${Math.round(gradient.angle * 60000)}" scaled="0"/><a:tileRect/></a:gradFill>`;
}
export function sceneShadowXml(shadow: SceneShadow | undefined, scale: number, opacity = 1): string {
  if (!shadow || shadow.opacity === 0) return "";
  const angle = (Math.atan2(shadow.y, shadow.x) * 180 / Math.PI + 360) % 360;
  return `<a:effectLst><a:outerShdw blurRad="${emu(shadow.blur * scale)}" dist="${emu(Math.hypot(shadow.x, shadow.y) * scale)}" dir="${Math.round(angle * 60000)}" algn="ctr" rotWithShape="1">${rgb(shadow.color, shadow.opacity * opacity)}</a:outerShdw></a:effectLst>`;
}
/** Full outer frame is retained, so Contain+off-centre focus rotates about the authored pivot. */
export function exportScenePicture(object: SlideSceneObject, id: number, relId: string, source: {width: number; height: number}, scale: number): string {
  const frame = {x: object.x * scale, y: object.y * scale, w: object.w * scale, h: object.h * scale};
  const layout = sceneImageLayout(frame, source, object.imageFit, object.imageFocusX, object.imageFocusY);
  const crop = layout.crop ? `<a:srcRect l="${layout.crop.l}" t="${layout.crop.t}" r="${layout.crop.r}" b="${layout.crop.b}"/>` : "";
  const fit = layout.rect, percent = (n: number) => Math.round(n * 100000);
  const fillRect = object.imageFit === "contain" ? `<a:fillRect l="${percent((fit.x-frame.x)/frame.w)}" t="${percent((fit.y-frame.y)/frame.h)}" r="${percent((frame.x+frame.w-fit.x-fit.w)/frame.w)}" b="${percent((frame.y+frame.h-fit.y-fit.h)/frame.h)}"/>` : "<a:fillRect/>";
  const geometry = object.imageMask ? sceneShapeGeometry({...object, ...object.imageMask, kind: "shape"}) : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const opacity = object.opacity ?? 1;
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Image ${id}" descr="${xml(object.id)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${xml(relId)}">${opacity < 1 ? `<a:alphaModFix amt="${alpha(opacity)}"/>` : ""}</a:blip>${crop}<a:stretch>${fillRect}</a:stretch></p:blipFill><p:spPr><a:xfrm rot="${Math.round(object.rotation*60000)}"><a:off x="${emu(frame.x)}" y="${emu(frame.y)}"/><a:ext cx="${emu(frame.w)}" cy="${emu(frame.h)}"/></a:xfrm>${geometry}${sceneShadowXml(object.shadow,scale,opacity)}</p:spPr></p:pic>`;
}
