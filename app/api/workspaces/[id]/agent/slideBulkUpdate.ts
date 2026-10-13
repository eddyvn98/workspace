import type { JsonMap } from "./operationsTables";
import { param, record } from "./operationsCore";
import { slideData, applySlideAction, type ActionOutcome } from "./slideOperations";
import { parseSlideFields } from "./slideFields";
import { MAX_DECK_SLIDES } from "./slideDeckCreate";

type Slide = JsonMap & { id: string; name: string; html: string };
const SELECTORS = ["slideId", "id", "index", "name"];

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

function resolveId(slides: Record<string, Slide>, order: string[], candidate: unknown): string | undefined {
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  if (Object.hasOwn(slides, candidate)) return candidate;
  const wanted = candidate.trim().toLowerCase();
  const named = order.filter((id) => String(slides[id].name).trim().toLowerCase() === wanted);
  return named.length === 1 ? named[0] : undefined;
}

function summary(slides: Record<string, Slide>, order: string[]): string {
  return order.map((id, index) => `${index + 1}. ${id} ("${slides[id].name}")`).join(", ");
}

/** update_slides: bulk, atomic edit of one deck. The block is only touched when every step succeeds.
 *  Order: slides[] updates, deleteSlideIds, slideOrder, insert[]. */
export function applySlidesUpdate(raw: JsonMap, block: JsonMap, out: ActionOutcome): boolean {
  const fail = (reason: string) => { out.reason = reason; return false; };
  const draft = structuredClone(block) as JsonMap;
  const notes: string[] = [];
  const updates = list(param(raw, "slides"));
  const inserts = list(param(raw, "insert"));
  const deletes = list(param(raw, "deleteSlideIds"));
  const requestedOrder = param(raw, "slideOrder");
  if (!updates.length && !inserts.length && !deletes.length && requestedOrder === undefined) {
    return fail("update_slides needs at least one of slides[], insert[], deleteSlideIds[] or slideOrder[].");
  }
  let data = slideData(draft);
  let slides = record(data.slides) as Record<string, Slide>;
  let order = [...(data.slideOrder as string[])];
  const originalCount = order.length;
  const touched: string[] = [];

  for (let index = 0; index < updates.length; index += 1) {
    const item = record(updates[index]);
    const where = `slides[${index}]`;
    const bySelector = param(item, "slideId") ?? param(item, "id") ?? (param(item, "index") !== undefined ? order[Number(param(item, "index")) - 1] : undefined);
    const usedName = bySelector === undefined && item.name !== undefined;
    const id = resolveId(slides, order, bySelector ?? (usedName ? item.name : undefined));
    if (!id) return fail(`${where}: no slide matches (use slideId, a 1-based index, or a unique name). Slides: ${summary(slides, order)}.`);
    const { slideId: _s, id: _i, index: _x, newName, ...fields } = item;
    const patch: JsonMap = { ...fields, slideId: id, ...(usedName ? { name: newName } : newName !== undefined ? { name: newName } : {}) };
    if (patch.name === undefined) delete patch.name;
    const outcome: ActionOutcome = {};
    if (!applySlideAction(patch, draft, "update_slide", outcome, { strict: true })) return fail(`${where}: ${outcome.reason}`);
    notes.push(...(outcome.notes ?? []).map((note) => `${where}: ${note}`));
    touched.push(id);
    data = record(draft.data);
    slides = record(data.slides) as Record<string, Slide>;
  }

  const removable = new Set<string>();
  for (const candidate of deletes) {
    const id = resolveId(slides, order, candidate);
    if (!id) return fail(`deleteSlideIds: no slide matches "${String(candidate)}". Slides: ${summary(slides, order)}.`);
    removable.add(id);
  }
  order = order.filter((id) => !removable.has(id));
  removable.forEach((id) => { delete slides[id]; });

  if (requestedOrder !== undefined) {
    const wanted = list(requestedOrder).map((item) => resolveId(slides, order, item) ?? String(item));
    if (wanted.length !== order.length || new Set(wanted).size !== order.length || wanted.some((id) => !order.includes(id))) {
      return fail(`slideOrder must list every remaining slide exactly once (${order.length} ids: ${summary(slides, order)}). Inserted slides are placed by insert[].`);
    }
    order = wanted;
  }

  const created: string[] = [];
  for (let index = 0; index < inserts.length; index += 1) {
    const item = record(inserts[index]);
    const where = `insert[${index}]`;
    const fields = parseSlideFields(item, { allowLayout: true, strict: true });
    if (!fields.ok) return fail(`${where}: ${fields.reason}`);
    notes.push(...fields.notes.map((note) => `${where}: ${note}`));
    if (!String(fields.set.html ?? "").trim() && !fields.set.name) return fail(`${where} has no content: give layout with its fields, or html.`);
    const after = param(item, "afterSlideId");
    const afterId = after !== undefined ? resolveId(slides, order, after) : undefined;
    if (after !== undefined && !afterId) return fail(`${where}: afterSlideId "${String(after)}" was not found among the remaining slides. Slides: ${summary(slides, order)}.`);
    const position = Number(param(item, "position"));
    const at = afterId ? order.indexOf(afterId) + 1 : Number.isFinite(position) && position >= 1 ? Math.min(Math.floor(position) - 1, order.length) : order.length;
    const id = crypto.randomUUID();
    slides[id] = { ...fields.set, id, name: String(fields.set.name ?? `Slide ${order.length + 1}`), html: String(fields.set.html ?? "") } as Slide;
    order.splice(at, 0, id);
    created.push(id);
  }

  if (!order.length) return fail("The deck would have no slides left. Keep at least one slide or insert new ones.");
  if (order.length > Math.max(MAX_DECK_SLIDES, originalCount)) return fail(`A deck can have at most ${MAX_DECK_SLIDES} slides (this edit would make ${order.length}).`);
  const active = created[0] ?? touched[0] ?? (typeof data.activeSlideId === "string" ? data.activeSlideId : undefined);
  draft.data = { ...data, slideOrder: order, slides, activeSlideId: active && order.includes(active) ? active : order[0] };
  draft.updatedAt = Date.now();
  block.data = draft.data;
  block.transform = draft.transform;
  block.updatedAt = draft.updatedAt;
  if (created.length) notes.push(`Inserted ${created.length} slide(s): ${created.join(", ")}.`);
  notes.push(`Deck now has ${order.length} slides.`);
  out.notes = notes;
  return true;
}
