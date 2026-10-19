import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { xml } from "./pptx-elements";
/** Numeric M/L/C/Q/Z paths are serialized into native, editable DrawingML geometry. */
export function sceneShapeGeometry(object: SlideSceneObject): string {
  const kind = object.shapeKind ?? (object.radius ? "roundRect" : "rect"), path = object.shapePath;
  if (kind !== "custom" || !path) {
    const radius = kind === "roundRect" ? Math.round(Math.min(0.5, (object.radius ?? Math.min(object.w, object.h) / 6) / Math.min(object.w, object.h)) * 100000) : null;
    return `<a:prstGeom prst="${xml(kind === "custom" ? "rect" : kind)}"><a:avLst>${radius === null ? "" : `<a:gd name="adj" fmla="val ${radius}"/>`}</a:avLst></a:prstGeom>`;
  }
  const point = (x: number, y: number) => `<a:pt x="${Math.round(x)}" y="${Math.round(y)}"/>`;
  const commands = path.commands.map(c => {
    if (c.type === "Z") return "<a:close/>";
    if (c.type === "C") return `<a:cubicBezTo>${point(c.x1, c.y1)}${point(c.x2, c.y2)}${point(c.x, c.y)}</a:cubicBezTo>`;
    if (c.type === "Q") return `<a:quadBezTo>${point(c.x1, c.y1)}${point(c.x, c.y)}</a:quadBezTo>`;
    return c.type === "M" ? `<a:moveTo>${point(c.x, c.y)}</a:moveTo>` : `<a:lnTo>${point(c.x, c.y)}</a:lnTo>`;
  }).join("");
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(path.width)}" h="${Math.round(path.height)}" fill="${object.fill === "transparent" ? "none" : "norm"}" stroke="${object.stroke && object.stroke !== "transparent" ? 1 : 0}">${commands}</a:path></a:pathLst></a:custGeom>`;
}
