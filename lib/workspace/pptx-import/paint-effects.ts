import { normalizeSceneGradient, normalizeSceneImageMask, normalizeSceneShadow, type ScenePaintFields } from "@/app/workspace/types/slideScenePaint";
import { child, children, elements, first, numeric, NS } from "./xml";
import { paint } from "./style";
import { readSceneShape } from "./shape";
import type { ImportFrame, NoticeSink, Theme } from "./model";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
function colorAlpha(node: Element | undefined): number {
  const color = elements(node).find(e => e.namespaceURI === NS.a && ["srgbClr", "schemeClr", "sysClr", "prstClr"].includes(e.localName));
  return clamp(numeric(child(color, NS.a, "alpha"), "val", 100000) / 100000, 0, 1);
}
/** Read declarative effects only. Unsupported filters are never interpreted as executable content. */
export function readScenePaint(props: Element | undefined, theme: Theme, scale: number, notice: NoticeSink): ScenePaintFields {
  const result: ScenePaintFields = {};
  const grad = child(props, NS.a, "gradFill");
  if (grad) {
    const linear = child(grad, NS.a, "lin"), stops = children(child(grad, NS.a, "gsLst"), NS.a, "gs");
    if (!linear) notice("gradient-kind", "A non-linear gradient is not supported; a solid fallback was retained.");
    else {
      const gradient = normalizeSceneGradient({kind:"linear", angle: ((numeric(linear,"ang")/60000)%360+360)%360,
        stops: stops.map(s => ({offset:numeric(s,"pos")/100000, color:paint(s,theme,"#000000"), opacity:colorAlpha(s)}))});
      if (gradient) result.gradient = gradient; else notice("gradient-stops", "A gradient outside the supported 2-12 bounded stops was reduced to a solid fill.");
      if (linear.getAttribute("scaled") !== "0" && linear.getAttribute("scaled") !== "false") notice("gradient-angle", "A scaled gradient angle was normalized to scene coordinates; compare its appearance on nonsquare shapes.");
    }
    if (["0","false"].includes(grad.getAttribute("rotWithShape")||"")) notice("gradient-rotation", "The imported gradient rotates with its shape.");
  }
  const effects = child(props, NS.a, "effectLst"), outer = child(effects, NS.a, "outerShdw");
  if (outer) {
    const rawBlur = numeric(outer,"blurRad")*scale, distance=numeric(outer,"dist")*scale, angle=numeric(outer,"dir")/60000*Math.PI/180;
    const x=distance*Math.cos(angle),y=distance*Math.sin(angle);
    if (rawBlur>64||Math.abs(x)>256||Math.abs(y)>256) notice("shadow-size", "An oversized shadow was fitted to the supported blur/offset limits.");
    const shadow=normalizeSceneShadow({color:paint(outer,theme,"#000000"),opacity:colorAlpha(outer),blur:clamp(rawBlur,0,64),x:clamp(x,-256,256),y:clamp(y,-256,256)});
    if (shadow) result.shadow=shadow;
    if (numeric(outer,"sx",100000)!==100000||numeric(outer,"sy",100000)!==100000||numeric(outer,"kx")||numeric(outer,"ky")||["0","false"].includes(outer.getAttribute("rotWithShape")||"")) notice("shadow-transform", "Perspective/skew/fixed-direction shadow transforms use an ordinary object-relative outer shadow.");
  }
  for (const effect of elements(effects)) if(effect.localName!=="outerShdw") notice("shape-effect", `Unsupported ${effect.localName} effect was not reproduced.`);
  if (child(props,NS.a,"effectDag")) notice("shape-effect", "An effect graph was not reproduced.");
  if (child(props,NS.a,"blipFill")||child(props,NS.a,"pattFill")) notice("shape-fill", "Pattern or picture shape fills need review; a solid fallback was retained.");
  return result;
}
export function readPictureMask(props: Element | undefined, frame: ImportFrame, scale: number, notice: NoticeSink): ScenePaintFields["imageMask"] {
  const preset=child(props,NS.a,"prstGeom")?.getAttribute("prst");
  if ((!preset||preset==="rect")&&!child(props,NS.a,"custGeom")) return;
  const fields=readSceneShape(props,frame,scale,notice);
  const mask=normalizeSceneImageMask(fields);
  if (!mask) notice("image-mask", "An unsupported picture mask was retained as a rectangular image.");
  return mask;
}
export function pictureOpacity(node: Element): number {
  const blip=first(node,NS.a,"blip");
  return clamp(numeric(child(blip,NS.a,"alphaModFix"),"amt",100000)/100000,0,1);
}
