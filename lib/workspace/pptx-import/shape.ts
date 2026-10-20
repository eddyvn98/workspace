import { SCENE_SHAPES, normalizeSceneVectorPath, type ScenePathCommand, type SceneShapeFields, type SceneShapeKind } from "@/app/workspace/types/slideSceneShape";
import { child, children, elements, numeric, NS } from "./xml";
import type { ImportFrame, NoticeSink } from "./model";

function point(node: Element | undefined): {x:number;y:number} | undefined {
  const x = node?.getAttribute("x"), y = node?.getAttribute("y");
  if (x == null || y == null || !x.trim() || !y.trim()) return;
  const value = {x:Number(x),y:Number(y)};
  return Object.values(value).every(Number.isFinite) ? value : undefined;
}
function customPath(geometry: Element): SceneShapeFields["shapePath"] {
  const paths = children(child(geometry,NS.a,"pathLst"),NS.a,"path");
  if (paths.length !== 1) return;
  const path = paths[0], width = Number(path.getAttribute("w")), height = Number(path.getAttribute("h"));
  const commands: ScenePathCommand[] = [];
  for (const command of elements(path)) {
    if (command.namespaceURI !== NS.a) return;
    const points = children(command,NS.a,"pt").map(point);
    if (command.localName === "close") commands.push({type:"Z"});
    else if (command.localName === "moveTo" || command.localName === "lnTo") {
      if (points.length !== 1 || !points[0]) return;
      commands.push({type:command.localName === "moveTo" ? "M":"L",...points[0]});
    } else if (command.localName === "cubicBezTo") {
      if (points.length !== 3 || points.some(p=>!p)) return;
      commands.push({type:"C",x1:points[0]!.x,y1:points[0]!.y,x2:points[1]!.x,y2:points[1]!.y,...points[2]!});
    } else if (command.localName === "quadBezTo") {
      if (points.length !== 2 || points.some(p=>!p)) return;
      commands.push({type:"Q",x1:points[0]!.x,y1:points[0]!.y,...points[1]!});
    } else return;
    if (commands.length > 256) return;
  }
  return normalizeSceneVectorPath({width,height,commands});
}
/** Read editable geometry as data. Unsupported formulas/arc paths retain the existing explicit fallback notice. */
export function readSceneShape(props: Element | undefined, frame: ImportFrame, coordinateScale: number, notice: NoticeSink): SceneShapeFields & {radius?:number} {
  const preset = child(props,NS.a,"prstGeom"), custom = child(props,NS.a,"custGeom"), name = preset?.getAttribute("prst") || "rect";
  let result: SceneShapeFields & {radius?:number} = {shapeKind:"rect"};
  if (custom) {
    const path = customPath(custom);
    if (path) result = {shapeKind:"custom",shapePath:path};
    else notice("shape-geometry","A multi-path, formula-based or arc geometry was approximated by a rectangle. Its text is retained.");
  } else if ((SCENE_SHAPES as readonly string[]).includes(name) && name !== "custom") {
    result.shapeKind = name as SceneShapeKind;
    const adjustments = children(child(preset,NS.a,"avLst"),NS.a,"gd");
    if (name === "roundRect") {
      const formula = adjustments.find(n=>n.getAttribute("name")==="adj")?.getAttribute("fmla"), match = formula?.match(/^val\s+(\d+(?:\.\d+)?)$/);
      const amount = match ? Math.min(50000,Number(match[1])) / 100000 : 0.16667;
      result.radius = Math.min(200,Math.min(frame.w,frame.h)*amount);
      if (adjustments.length && !match) notice("shape-adjustment","A rounded-rectangle adjustment uses the default corner radius.");
    } else if (adjustments.length) notice("shape-adjustment","Custom shape handles use the preset's standard proportions; editable geometry and text remain available.");
  } else notice("shape-geometry",`Unsupported preset ${name} was approximated by a rectangle; its text is retained.`);
  const line = child(props,NS.a,"ln"), width = numeric(line,"w",19050) * coordinateScale;
  result.strokeWidth = Math.max(0,Math.min(40,width));
  if (width > 40) notice("shape-line","A shape outline width was fitted to the supported 0-40 scene-pixel range.");
  const dash = child(line,NS.a,"prstDash")?.getAttribute("val");
  result.strokeDash = dash === "dash" ? "dash" : dash === "dot" || dash === "sysDot" ? "dot" : "solid";
  if (dash && !["solid","dash","dot","sysDot"].includes(dash) || child(line,NS.a,"custDash")) notice("shape-line","A custom outline dash was normalized to a solid line.");
  if (child(line,NS.a,"headEnd")?.getAttribute("type") && child(line,NS.a,"headEnd")?.getAttribute("type") !== "none" || child(line,NS.a,"tailEnd")?.getAttribute("type") && child(line,NS.a,"tailEnd")?.getAttribute("type") !== "none") notice("shape-line-ends","Custom line-end markers need review; the line remains editable.");
  return result;
}
