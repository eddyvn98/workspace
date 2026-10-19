import type { SlideMeta } from "@/app/workspace/types/slide";
import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
export type ImportNotice = { slide?: number; code: string; message: string };
export type NoticeSink = (code: string, message: string) => void;
export type ImportAsset = { src: string; name: string; mime: string; bytes: Uint8Array; width: number; height: number };
export type PptxImportResult = {
  title: string;
  aspectRatio: "16:9" | "4:3";
  slides: SlideMeta[];
  assets: ImportAsset[];
  notices: ImportNotice[];
};
export type ImportFrame = Pick<SlideSceneObject, "x" | "y" | "w" | "h" | "rotation">;
export type Theme = { colors: Record<string, string>; majorFont: string; minorFont: string };
export const DEFAULT_THEME: Theme = {
  colors: { dk1: "#000000", lt1: "#FFFFFF", dk2: "#1F2937", lt2: "#F1F5F9", accent1: "#2563EB", accent2: "#16A34A" },
  majorFont: "Arial", minorFont: "Arial",
};
/** Refuse data loss instead of silently truncating a large imported slide. */
export function appendObjects(target: SlideSceneObject[], items: SlideSceneObject[]): void {
  if (target.length + items.length > 120) throw new Error("Imported slide exceeds 120 editable objects. Split it in PowerPoint first.");
  for (const item of items) {
    if ((item.text?.length ?? 0) > 10000) throw new Error("Imported text or cached chart data exceeds 10,000 characters. Split it before importing.");
    if (item.series?.some(point => point.label.length > 80)) throw new Error("An imported chart label exceeds 80 characters. Shorten it before importing.");
  }
  target.push(...items);
}
