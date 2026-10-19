import { child, numeric, NS } from "./xml";
import type { ImportFrame, NoticeSink } from "./model";
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const scale = (x: number, y: number): Matrix => [x, 0, 0, y, 0, 0];
function rotate(degrees: number): Matrix {
  const a = degrees * Math.PI / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
}
export function transform(node: Element | undefined, parent: Matrix, group = false): Matrix | null {
  if (!node) return null;
  const off = child(node, NS.a, "off"), ext = child(node, NS.a, "ext");
  if (!off || !ext) return null;
  const x = numeric(off, "x"), y = numeric(off, "y"), w = numeric(ext, "cx"), h = numeric(ext, "cy");
  if (w <= 0 || h <= 0) return null;
  const angle = numeric(node, "rot") / 60000;
  const sx = node.getAttribute("flipH") === "1" || node.getAttribute("flipH") === "true" ? -1 : 1;
  const sy = node.getAttribute("flipV") === "1" || node.getAttribute("flipV") === "true" ? -1 : 1;
  const centred = multiply(translate(x + w/2, y + h/2), multiply(rotate(angle), scale(sx, sy)));
  if (!group) return multiply(parent, multiply(centred, multiply(scale(w,h), translate(-0.5,-0.5))));
  const chOff = child(node, NS.a, "chOff"), chExt = child(node, NS.a, "chExt");
  const cw = numeric(chExt, "cx"), ch = numeric(chExt, "cy");
  if (!chOff || !chExt || cw <= 0 || ch <= 0) return null;
  return multiply(parent, multiply(centred, multiply(scale(w/cw,h/ch), translate(-numeric(chOff,"x")-cw/2,-numeric(chOff,"y")-ch/2))));
}
export function subFrame(matrix: Matrix, x: number, y: number, w: number, h: number): Matrix {
  return multiply(matrix, multiply(translate(x, y), scale(w,h)));
}
export function frame(matrix: Matrix, notice: NoticeSink): ImportFrame {
  const w = Math.hypot(matrix[0], matrix[1]), h = Math.hypot(matrix[2], matrix[3]);
  const cx = matrix[4] + (matrix[0]+matrix[2])/2, cy = matrix[5] + (matrix[1]+matrix[3])/2;
  if (!Number.isFinite(w+h+cx+cy) || w <= 0 || h <= 0) throw new Error("Invalid PPTX object geometry");
  if (Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3]) > w*h*0.0001) notice("shear", "A sheared group was approximated using rotated rectangles.");
  if (matrix[0]*matrix[3]-matrix[1]*matrix[2] < 0) notice("flip", "Mirrored content needs visual review; reflection is not supported by Scene V2.");
  const result = { x: cx-w/2, y: cy-h/2, w, h, rotation: Math.atan2(matrix[1],matrix[0])*180/Math.PI };
  // Values must survive Scene V2 normalization without silent loss.
  if (result.x < -1280 || result.x > 2560 || result.y < -960 || result.y > 1920 || w > 2560 || h > 1920) {
    throw new Error("A PPTX object exceeds the editable scene bounds. Resize it in PowerPoint first.");
  }
  return { ...result, w: Math.max(8,w), h: Math.max(8,h) };
}
