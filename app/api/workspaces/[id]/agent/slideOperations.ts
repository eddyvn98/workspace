import type { JsonMap } from "./operationsTables";
import { parseSlideFields, param, type ActionOutcome } from "./slideFields";
import { parseBoolean, parseColor, parseThemePatch } from "./slideValidation";
import { normalizeSlideTheme } from "@/app/workspace/utils/slideTheme";

export type { ActionOutcome } from "./slideFields";
export type SlideActionOptions = { strict?: boolean };
type Slide = JsonMap & { id: string; name: string; html: string };

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

export function slideData(block: JsonMap): JsonMap {
  const source = record(block.data);
  const sourceSlides = record(source.slides);
  const slides: Record<string, Slide> = {};
  Object.entries(sourceSlides).forEach(([id, item]) => {
    if (id === "__proto__") return;
    const slide = record(item);
    slides[id] = { ...slide, id, name: String(slide.name ?? id), html: String(slide.html ?? "") } as Slide;
  });
  const order = Array.isArray(source.slideOrder) ? source.slideOrder.map(String).filter((id) => Object.hasOwn(slides, id)) : [];
  if (!order.length) {
    const id = crypto.randomUUID();
    slides[id] = { id, name: "Slide 1", html: "" };
    order.push(id);
  }
  return { ...source, slideOrder: order, slides, aspectRatio: source.aspectRatio === "4:3" ? "4:3" : "16:9" };
}

/** Resolves a slide by exact id, or by a name that identifies exactly one slide. */
function resolveSlide(candidate: unknown, data: JsonMap): string | undefined {
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  const slides = record(data.slides) as Record<string, Slide>;
  if (Object.hasOwn(slides, candidate)) return candidate;
  const wanted = candidate.trim().toLowerCase();
  const byName = Object.values(slides).filter((slide) => String(slide.name).trim().toLowerCase() === wanted);
  return byName.length === 1 ? byName[0].id : undefined;
}

function targetId(raw: JsonMap, data: JsonMap): string | undefined {
  return resolveSlide(param(raw, "slideId") ?? param(raw, "id") ?? param(raw, "target"), data);
}

function slideList(data: JsonMap): string {
  const slides = record(data.slides) as Record<string, Slide>;
  return (data.slideOrder as string[]).map((id) => `${id} ("${slides[id].name}")`).join(", ");
}

function notFound(raw: JsonMap, data: JsonMap, out: ActionOutcome): false {
  const given = param(raw, "slideId") ?? param(raw, "id") ?? param(raw, "target");
  out.reason = given === undefined
    ? `slideId is required. Slides in this deck: ${slideList(data)}.`
    : `No slide matches "${String(given)}" (use an exact slideId or a unique slide name). Slides in this deck: ${slideList(data)}.`;
  return false;
}

function applyDeckUpdate(raw: JsonMap, data: JsonMap, out: ActionOutcome, notes: string[]): boolean {
  const set: JsonMap = {};
  const remove: string[] = [];
  const fail = (reason: string) => { out.reason = reason; return false; };
  const ratio = param(raw, "aspectRatio");
  if (ratio !== undefined) {
    if (ratio !== "16:9" && ratio !== "4:3") return fail(`Invalid aspectRatio "${String(ratio)}". Use "16:9" or "4:3".`);
    set.aspectRatio = ratio;
  }
  const title = param(raw, "title");
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) return fail("title must be a non-empty string.");
    set.title = title.trim();
  }
  const numbers = param(raw, "showSlideNumbers");
  if (numbers !== undefined) {
    const parsed = parseBoolean(numbers, "showSlideNumbers");
    if (!parsed.ok) return fail(parsed.reason);
    if (parsed.value) set.showSlideNumbers = true; else remove.push("showSlideNumbers");
  }
  let themeBackground: string | undefined;
  const themeInput = param(raw, "theme");
  if (themeInput !== undefined) {
    const parsed = parseThemePatch(themeInput);
    if (!parsed.ok) return fail(parsed.reason);
    const merged: JsonMap = { ...record(data.theme), ...parsed.patch };
    Object.keys(merged).forEach((key) => { if (merged[key] === undefined) delete merged[key]; });
    const theme = normalizeSlideTheme(merged);
    if (theme) set.theme = theme; else remove.push("theme");
    themeBackground = parsed.patch.backgroundColor;
  }
  const applyAll = param(raw, "applyToAll");
  if (applyAll === true || applyAll === "true") {
    const explicit = param(raw, "backgroundColor");
    const parsed = explicit !== undefined ? parseColor(explicit, "backgroundColor") : { ok: true as const, value: themeBackground ?? normalizeSlideTheme(data.theme)?.backgroundColor };
    if (!parsed.ok) return fail(parsed.reason);
    if (!parsed.value) return fail("applyToAll needs a backgroundColor (top-level or inside theme) to copy onto every slide.");
    const slides = record(data.slides) as Record<string, Slide>;
    data.slides = Object.fromEntries(Object.entries(slides).map(([id, slide]) => [id, { ...slide, backgroundColor: parsed.value }]));
    notes.push(`Applied background ${parsed.value} to all ${Object.keys(slides).length} slides.`);
  } else if (param(raw, "backgroundColor") !== undefined && (Object.keys(set).length || remove.length)) {
    notes.push("backgroundColor was ignored: at deck level it only applies with applyToAll:true. Use update_slide {backgroundColor} for one slide, or theme.backgroundColor for the deck default.");
  } else if (!Object.keys(set).length && !remove.length) {
    return fail("update_slide_deck needs at least one of aspectRatio, title, theme, showSlideNumbers, or applyToAll with a backgroundColor.");
  }
  Object.assign(data, set);
  remove.forEach((key) => delete data[key]);
  return true;
}

function applyFields(slide: Slide, fields: { set: JsonMap; clear: string[] }): Slide {
  const next = { ...slide, ...fields.set } as JsonMap;
  fields.clear.forEach((key) => delete next[key]);
  return next as Slide;
}

export function applySlideAction(raw: JsonMap, block: JsonMap, type: string, out: ActionOutcome = {}, options: SlideActionOptions = {}): boolean {
  const data = slideData(block);
  const slides = record(data.slides) as Record<string, Slide>;
  const order = data.slideOrder as string[];
  const notes: string[] = [];
  const wantsCopy = type === "duplicate_slide" || (type === "add_slide" && (param(raw, "copy") === true || param(raw, "copy") === "true"));
  if (type === "add_slide" || type === "duplicate_slide") {
    const given = param(raw, "slideId");
    const sourceId = wantsCopy ? targetId(raw, data) : undefined;
    if (wantsCopy && !sourceId) return notFound(raw, data, out);
    if (!wantsCopy && given !== undefined) notes.push("add_slide ignored slideId and created a blank slide. To copy a slide use duplicate_slide (or add_slide with copy:true); to position the new slide use afterSlideId.");
    const fields = parseSlideFields(raw, { allowLayout: !wantsCopy });
    if (!fields.ok) { out.reason = fields.reason; return false; }
    notes.push(...fields.notes);
    const id = crypto.randomUUID();
    const base: Slide = sourceId
      ? { ...slides[sourceId], id, name: `${slides[sourceId].name} copy` }
      : { id, name: `Slide ${order.length + 1}`, html: "" };
    const slide = applyFields(base, fields);
    const afterRaw = param(raw, "afterSlideId");
    const afterId = afterRaw !== undefined ? resolveSlide(afterRaw, data) : sourceId;
    if (afterRaw !== undefined && !afterId) notes.push(`afterSlideId "${String(afterRaw)}" was not found; the slide was appended at the end.`);
    const index = afterId ? order.indexOf(afterId) + 1 : order.length;
    order.splice(index > 0 ? index : order.length, 0, id);
    data.slides = { ...slides, [id]: slide };
    data.activeSlideId = id;
    notes.push(`Created slide ${id} ("${slide.name}") at position ${order.indexOf(id) + 1}.`);
  } else if (type === "delete_slide") {
    const id = targetId(raw, data);
    if (!id) return notFound(raw, data, out);
    if (order.length <= 1) {
      out.reason = "Cannot delete the only slide: a deck needs at least one slide. Use update_slide to clear or rewrite it, or add another slide first.";
      return false;
    }
    const nextOrder = order.filter((item) => item !== id);
    const nextSlides = { ...slides };
    delete nextSlides[id];
    data.slideOrder = nextOrder;
    data.slides = nextSlides;
    if (data.activeSlideId === id) data.activeSlideId = nextOrder[0];
  } else if (type === "reorder_slides") {
    const given = param(raw, "slideOrder");
    const requested = Array.isArray(given) ? given.map((item) => resolveSlide(String(item), data) ?? String(item)) : [];
    if (requested.length !== order.length || requested.some((id) => !Object.hasOwn(slides, id)) || new Set(requested).size !== order.length) {
      out.reason = `slideOrder must list every slide exactly once (${order.length} ids). Current order: ${slideList(data)}.`;
      return false;
    }
    data.slideOrder = requested;
  } else if (type === "update_slide_deck") {
    if (!applyDeckUpdate(raw, data, out, notes)) return false;
  } else if (type === "update_slide") {
    const id = targetId(raw, data);
    if (!id) return notFound(raw, data, out);
    const fields = parseSlideFields(raw, { allowLayout: true, strict: options.strict, requireImage: true });
    if (!fields.ok) { out.reason = fields.reason; return false; }
    if (!Object.keys(fields.set).length && !fields.clear.length) {
      out.reason = "update_slide needs at least one of name, html, layout, presenterNotes, status, backgroundColor, hidden.";
      return false;
    }
    notes.push(...fields.notes);
    data.slides = { ...slides, [id]: applyFields(slides[id], fields) };
    data.activeSlideId = id;
  } else {
    out.reason = `Unsupported slide action ${type}.`;
    return false;
  }
  const transform = record(block.transform);
  const override = record(transform.override);
  const computed = record(transform.computed);
  const currentTransform = override.x !== undefined ? override : computed;
  if (Number(currentTransform.w) < 480 || Number(currentTransform.h) < 360) {
    block.transform = {
      ...transform,
      override: { ...currentTransform, w: Math.max(480, Number(currentTransform.w) || 0), h: Math.max(360, Number(currentTransform.h) || 0) },
    };
  }
  const { slideOrder, slides: finalSlides, ...rest } = data;
  block.data = { ...rest, slideOrder, slides: finalSlides };
  block.updatedAt = Date.now();
  if (notes.length) out.notes = notes;
  return true;
}
