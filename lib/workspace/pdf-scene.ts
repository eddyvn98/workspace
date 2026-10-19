import type { SlideScene, SlideSceneObject } from "@/app/workspace/types/slideScene";
import { xml } from "./pptx-elements";
import { sceneImageRenderRect } from "./slide-image-layout";
import { wrapExportText } from "./slide-export-layout";
import type { ExportImage } from "./slide-export-images";

type ImageLoader = (src: string) => Promise<ExportImage>;
const attr = (value: string | undefined, fallback: string) => xml(value || fallback);
const shapeColor = (value: string | undefined, fallback: string) => attr(value, fallback);
const textHeight = (fontSize: number) => fontSize * 1.12;

function sceneText(object: SlideSceneObject): string {
  const size = object.fontSize ?? 44;
  const x = object.align === "center" ? object.x + object.w / 2
    : object.align === "right" ? object.x + object.w : object.x;
  const anchor = object.align === "center" ? "middle" : object.align === "right" ? "end" : "start";
  const maxChars = Math.max(1, Math.floor(object.w / (size * 0.55)));
  const lines = wrapExportText(object.text ?? "", maxChars);
  return `<text font-family="${attr(object.fontFamily, "Arial")}" font-weight="${object.fontWeight === "bold" ? "bold" : "normal"}" fill="${shapeColor(object.color, "#0f172a")}" font-size="${size}" text-anchor="${anchor}">${lines.map((line, i) =>
    `<tspan x="${x}" y="${object.y + size + i * textHeight(size)}">${xml(line)}</tspan>`).join("")}</text>`;
}

function sceneChart(object: SlideSceneObject): string {
  const series = object.series ?? [];
  if (!series.length) return "";
  const maximum = Math.max(1, ...series.map((item) => item.value));
  const inset = Math.min(25, object.w * 0.05), labelHeight = Math.max(14, object.h * 0.11);
  const areaWidth = object.w - inset * 2, areaHeight = object.h - inset * 2 - labelHeight;
  const width = areaWidth / series.length;
  return `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" fill="#ffffff"/>${series.map((item, i) => {
    const barHeight = item.value / maximum * Math.max(1, areaHeight);
    const x = object.x + inset + i * width + width * 0.14;
    const y = object.y + inset + areaHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${width * 0.72}" height="${barHeight}" fill="${shapeColor(object.fill, "#4f46e5")}"/><text x="${x + width * 0.36}" y="${object.y + object.h - inset / 2}" font-family="Arial" font-size="${Math.max(11, Math.min(18, width * 0.22))}" text-anchor="middle" fill="#111827">${xml(item.label)}</text>`;
  }).join("")}`;
}

async function sceneObjectSvg(object: SlideSceneObject, index: number, loadImage: ImageLoader): Promise<string> {
  const cx = object.x + object.w / 2, cy = object.y + object.h / 2;
  const clipId = `scene-clip-${index}`;
  const opening = `<defs><clipPath id="${clipId}"><rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}"/></clipPath></defs>`;
  let child = "";
  if (object.kind === "text") child = sceneText(object);
  if (object.kind === "shape") child = `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="${object.radius ?? 0}" fill="${shapeColor(object.fill, "#4f46e5")}" stroke="${shapeColor(object.stroke, "none")}"/>`;
  if (object.kind === "chart") child = sceneChart(object);
  if (object.kind === "image" && object.src) {
    const image = await loadImage(object.src);
    const fit=sceneImageRenderRect({x:object.x,y:object.y,w:object.w,h:object.h},image,object.imageFit,object.imageFocusX,object.imageFocusY);
    child = `<image x="${fit.x}" y="${fit.y}" width="${fit.w}" height="${fit.h}" preserveAspectRatio="none" href="data:image/png;base64,${image.buffer.toString("base64")}"/>`;
  }
  const rotation = Number.isFinite(object.rotation) ? object.rotation : 0;
  const opacity = object.opacity ?? 1;
  return `${opening}<g transform="rotate(${rotation} ${cx} ${cy})" opacity="${opacity}" clip-path="url(#${clipId})">${child}</g>`;
}

/** Render the editable scene in its original z-order; no browser or remote image fetch. */
export async function slideScenePdfSvg(scene: SlideScene, exportWidth: number, loadImage: ImageLoader): Promise<string> {
  const shapes = await Promise.all(scene.objects.map((object, index) => sceneObjectSvg(object, index, loadImage)));
  return `<g transform="scale(${exportWidth / scene.width})">${shapes.join("")}</g>`;
}
