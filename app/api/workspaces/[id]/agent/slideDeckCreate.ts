import type { JsonMap } from "./operationsTables";
import { blockRect, freePosition, param, record } from "./operationsCore";
import type { AgentBoardState } from "./operationsCore";
import { parseSlideFields, type ActionOutcome } from "./slideFields";
import { parseThemePatch } from "./slideValidation";
import { parseSlideLayout } from "./slideLayouts";
import { normalizeSlideTheme } from "@/app/workspace/utils/slideTheme";
import { themeFromPreset } from "@/app/workspace/utils/slideThemePresets";

export const MAX_DECK_SLIDES = 60;

/** Chooses a layout for a slide that gave content fields but no layout or html. */
function inferLayout(item: JsonMap, index: number): string {
  const has = (key: string) => item[key] !== undefined && item[key] !== "" && !(Array.isArray(item[key]) && !(item[key] as unknown[]).length);
  if (has("items")) return "stats";
  if (has("steps")) return "process";
  if (has("text") && !has("title")) return "quote";
  if (has("leftTitle") || has("rightTitle")) return "comparison";
  if (has("left") || has("right")) return "two-column";
  if (has("imageUrl")) return "image-caption";
  if (has("bullets")) return "title-bullets";
  return index === 0 ? "title" : "section";
}

/** Builds the slide records for create_slide_deck, or returns a reason naming the bad slide. */
export function buildDeckSlides(input: unknown, notes: string[]): { ok: true; slides: JsonMap[] } | { ok: false; reason: string } {
  if (!Array.isArray(input) || !input.length) return { ok: false, reason: "slides must be a non-empty array of slide objects {layout, title, bullets, ...}." };
  if (input.length > MAX_DECK_SLIDES) return { ok: false, reason: `A deck can have at most ${MAX_DECK_SLIDES} slides (got ${input.length}). Split it into several decks or cut slides.` };
  const slides: JsonMap[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = record(input[index]);
    const where = `slides[${index}]`;
    if (!Object.keys(item).length) return { ok: false, reason: `${where} must be an object.` };
    const withLayout = item.html === undefined && item.layout === undefined ? { ...item, layout: inferLayout(item, index) } : item;
    const fields = parseSlideFields(withLayout, { allowLayout: true, strict: true });
    if (!fields.ok) return { ok: false, reason: `${where}: ${fields.reason}` };
    if (!String(fields.set.html ?? "").trim() && parseSlideLayout(withLayout.layout) !== "blank") return { ok: false, reason: `${where} has no content: give layout with its fields, or html.` };
    notes.push(...fields.notes.map((note) => `${where}: ${note}`));
    const slide: JsonMap = { id: crypto.randomUUID(), name: String(fields.set.name ?? `Slide ${index + 1}`), html: String(fields.set.html ?? "") };
    for (const [key, value] of Object.entries(fields.set)) if (key !== "name" && key !== "html") slide[key] = value;
    slides.push(slide);
  }
  return { ok: true, slides };
}

/** create_slide_deck: one new slideDeck block holding every slide, placed like create_block. */
export function createSlideDeck(state: AgentBoardState, raw: JsonMap): { ids: string[]; operation: string; reason?: string; notes?: string[] } {
  const operation = "create_slide_deck";
  const out: ActionOutcome = { notes: [] };
  const fail = (reason: string) => ({ ids: [], operation, reason });
  const built = buildDeckSlides(param(raw, "slides"), out.notes!);
  if (!built.ok) return fail(built.reason);
  const ratio = param(raw, "aspectRatio");
  if (ratio !== undefined && ratio !== "16:9" && ratio !== "4:3") return fail(`Invalid aspectRatio "${String(ratio)}". Use "16:9" or "4:3".`);
  const title = param(raw, "title");
  if (title !== undefined && (typeof title !== "string" || !title.trim())) return fail("title must be a non-empty string.");
  let theme = themeFromPreset("clean");
  const themeInput = param(raw, "theme");
  if (themeInput !== undefined) {
    const parsed = parseThemePatch(themeInput);
    if (!parsed.ok) return fail(parsed.reason);
    const merged: JsonMap = { ...(parsed.patch.preset ? {} : theme), ...parsed.patch };
    Object.keys(merged).forEach((key) => { if (merged[key] === undefined) delete merged[key]; });
    theme = normalizeSlideTheme(merged) ?? theme;
  }
  const aspectRatio = ratio === "4:3" ? "4:3" : "16:9";
  const [width, height] = aspectRatio === "4:3" ? [640, 480] : [720, 440];
  const num = (key: string) => (Number.isFinite(Number(param(raw, key))) && param(raw, key) !== undefined ? Number(param(raw, key)) : undefined);
  const afterId = typeof param(raw, "afterBlockId") === "string" ? String(param(raw, "afterBlockId")) : undefined;
  const anchor = afterId && Object.hasOwn(state.blocks, afterId) ? blockRect(state.blocks[afterId]) : undefined;
  if (afterId && !anchor) out.notes!.push(`afterBlockId "${afterId}" was not found; the deck was placed at a free position.`);
  const preferred = anchor ? { x: anchor.x + anchor.w + 60, y: anchor.y } : { x: num("x") ?? 80, y: num("y") ?? 80 };
  const position = freePosition(state, preferred, width, height);
  const createdAt = Date.now();
  const id = crypto.randomUUID();
  state.blocks[id] = {
    id,
    type: "slideDeck",
    transform: { computed: null, override: { x: position.x, y: position.y, w: width, h: height, rotation: 0, zIndex: state.blockOrder.length } },
    createdAt,
    updatedAt: createdAt,
    style: {},
    data: {
      slideOrder: built.slides.map((slide) => String(slide.id)),
      slides: Object.fromEntries(built.slides.map((slide) => [String(slide.id), slide])),
      activeSlideId: String(built.slides[0].id),
      aspectRatio,
      theme,
      ...(typeof title === "string" ? { title: title.trim() } : {}),
    },
  };
  state.blockOrder.push(id);
  out.notes!.push(`Created deck ${id} with ${built.slides.length} slides.`);
  return { ids: [id], operation, notes: out.notes };
}
