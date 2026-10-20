import { createWorkspaceId } from "./workspaceId";
import type { SlideDeckPayload, SlideMeta, SlideStatus, SlideTheme } from "../types/slide";
import { normalizeSlideTheme } from "./slideTheme";
import { normalizeSlideScene } from "../types/slideScene";

function createSlide(name: string): SlideMeta {
  return { id: createWorkspaceId(), name, html: "" };
}

/** Guarantees at least one slide and a consistent slideOrder/slides pair -
 *  called once by the renderer on every render, mirroring normalizeTableData. */
export function normalizeSlideDeckData(data: Partial<SlideDeckPayload> | undefined): SlideDeckPayload {
  const slides = { ...(data?.slides ?? {}) };
  for (const [id, slide] of Object.entries(slides)) {
    if (slide.scene !== undefined) {
      const scene = normalizeSlideScene(slide.scene, data?.aspectRatio === "4:3" ? "4:3" : "16:9");
      slides[id] = { ...slide, ...(scene ? { scene } : { scene: undefined }) };
    }
  }
  let slideOrder = (data?.slideOrder ?? []).filter((id) => Object.hasOwn(slides, id));
  if (slideOrder.length === 0) {
    const first = createSlide("Slide 1");
    slides[first.id] = first;
    slideOrder = [first.id];
  }
  const activeSlideId = data?.activeSlideId && Object.hasOwn(slides, data.activeSlideId) ? data.activeSlideId : slideOrder[0];
  const theme = normalizeSlideTheme(data?.theme);
  const title = typeof data?.title === "string" && data.title.trim() ? data.title.trim() : undefined;
  return {
    slideOrder, slides, aspectRatio: data?.aspectRatio === "4:3" ? "4:3" : "16:9", activeSlideId,
    ...(title ? { title } : {}),
    ...(theme ? { theme } : {}),
    ...(data?.showSlideNumbers === true ? { showSlideNumbers: true } : {}),
  };
}

/** Slides shown in Present mode: hidden ones are skipped (all, if every slide is hidden). */
export function presentableSlideOrder(data: SlideDeckPayload): string[] {
  const visible = data.slideOrder.filter((id) => Object.hasOwn(data.slides, id) && !data.slides[id].hidden);
  return visible.length ? visible : data.slideOrder;
}

/** Present start position: the active slide, or the nearest following visible slide when it is hidden. */
export function presentStartIndex(data: SlideDeckPayload, presentOrder: string[]): number {
  const active = data.activeSlideId ?? data.slideOrder[0];
  const direct = presentOrder.indexOf(active);
  if (direct >= 0) return direct;
  const position = data.slideOrder.indexOf(active);
  const following = position < 0 ? undefined : data.slideOrder.slice(position + 1).find((id) => presentOrder.includes(id));
  if (following) return presentOrder.indexOf(following);
  return Math.max(0, presentOrder.length - 1);
}

/** Keeps a present index inside [0, length - 1]. */
export const clampPresentIndex = (index: number, length: number): number => Math.min(Math.max(index, 0), Math.max(0, length - 1));

export function addSlide(data: SlideDeckPayload, afterId?: string, starter?: { html: string; name: string }): SlideDeckPayload {
  const slide = { ...createSlide(starter?.name ?? `Slide ${data.slideOrder.length + 1}`), ...(starter ? { html: starter.html } : {}) };
  const insertAt = afterId ? data.slideOrder.indexOf(afterId) + 1 : data.slideOrder.length;
  const slideOrder = [...data.slideOrder];
  slideOrder.splice(insertAt, 0, slide.id);
  return { ...data, slideOrder, slides: { ...data.slides, [slide.id]: slide }, activeSlideId: slide.id };
}

export function duplicateSlide(data: SlideDeckPayload, id: string): SlideDeckPayload {
  const source = data.slides[id];
  if (!source) return data;
  const copy: SlideMeta = { ...source, id: createWorkspaceId(), name: `${source.name} copy`, ...(source.scene ? {scene: {...source.scene, objects: source.scene.objects.map(o=>({...o,id:createWorkspaceId()}))}} : {}) };
  const insertAt = data.slideOrder.indexOf(id) + 1;
  const slideOrder = [...data.slideOrder];
  slideOrder.splice(insertAt, 0, copy.id);
  return { ...data, slideOrder, slides: { ...data.slides, [copy.id]: copy }, activeSlideId: copy.id };
}

export function deleteSlide(data: SlideDeckPayload, id: string): SlideDeckPayload {
  if (data.slideOrder.length <= 1) return data;
  const slideOrder = data.slideOrder.filter((s) => s !== id);
  const slides = { ...data.slides };
  delete slides[id];
  const activeSlideId = data.activeSlideId === id ? slideOrder[0] : data.activeSlideId;
  return { ...data, slideOrder, slides, activeSlideId };
}

export function reorderSlide(data: SlideDeckPayload, fromIndex: number, toIndex: number): SlideDeckPayload {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return data;
  if (fromIndex >= data.slideOrder.length || toIndex >= data.slideOrder.length) return data;
  const slideOrder = [...data.slideOrder];
  const [moved] = slideOrder.splice(fromIndex, 1);
  slideOrder.splice(toIndex, 0, moved);
  return { ...data, slideOrder };
}

function patchSlide(data: SlideDeckPayload, id: string, patch: Partial<SlideMeta>): SlideDeckPayload {
  const source = data.slides[id];
  if (!source) return data;
  return { ...data, slides: { ...data.slides, [id]: { ...source, ...patch } } };
}

export function updateSlideHtml(data: SlideDeckPayload, id: string, html: string): SlideDeckPayload {
  return patchSlide(data, id, { html });
}

export function renameSlide(data: SlideDeckPayload, id: string, name: string): SlideDeckPayload {
  return patchSlide(data, id, { name });
}

export function updateSlideNotes(data: SlideDeckPayload, id: string, presenterNotes: string): SlideDeckPayload {
  return patchSlide(data, id, { presenterNotes });
}

export function updateSlideStatus(data: SlideDeckPayload, id: string, status: SlideStatus | undefined): SlideDeckPayload {
  return patchSlide(data, id, { status });
}

export function updateSlideBackground(data: SlideDeckPayload, id: string, backgroundColor: string | undefined): SlideDeckPayload {
  return patchSlide(data, id, { backgroundColor });
}

export function setActiveSlide(data: SlideDeckPayload, id: string): SlideDeckPayload {
  return Object.hasOwn(data.slides, id) ? { ...data, activeSlideId: id } : data;
}

export function updateSlideHidden(data: SlideDeckPayload, id: string, hidden: boolean): SlideDeckPayload {
  return patchSlide(data, id, { hidden: hidden ? true : undefined });
}

export function updateDeckTheme(data: SlideDeckPayload, patch: Partial<SlideTheme>): SlideDeckPayload {
  const merged: SlideTheme = { ...data.theme, ...patch };
  // Hand-picked colours or fonts no longer match the named preset.
  if (!("preset" in patch)) delete merged.preset;
  (Object.keys(merged) as Array<keyof SlideTheme>).forEach((key) => { if (!merged[key]) delete merged[key]; });
  return { ...data, theme: Object.keys(merged).length ? merged : undefined };
}

export function setShowSlideNumbers(data: SlideDeckPayload, show: boolean): SlideDeckPayload {
  return { ...data, showSlideNumbers: show ? true : undefined };
}

/** Writes one background colour onto every slide (the "apply to all" action). */
export function applyBackgroundToAllSlides(data: SlideDeckPayload, color: string): SlideDeckPayload {
  const slides = Object.fromEntries(Object.entries(data.slides).map(([id, slide]) => [id, { ...slide, backgroundColor: color }]));
  return { ...data, slides };
}
