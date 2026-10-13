import { record, param, resolveId, type AgentBoardState } from "./operationsCore";
import { resolveFrameCamera } from "./frameOperations";

export function applyPresentationView(state: AgentBoardState, raw: Record<string, unknown>): { changed: boolean; ids: string[]; reason?: string } {
  const blockId = resolveId(raw, state);
  const block = blockId ? state.blocks[blockId] : undefined;
  const current = record(state.camera);
  const seq = (Number(record(current.focus).seq) || 0) + 1;
  if (block) {
    if (block.type !== "slideDeck") return { changed: false, ids: [], reason: "Present mode needs a slideDeck block or saved frames." };
    const data = record(block.data), slides = record(data.slides);
    const visible = (Array.isArray(data.slideOrder) ? data.slideOrder : []).filter((id) => slides[String(id)] && record(slides[String(id)]).hidden !== true);
    if (!visible.length) return { changed: false, ids: [], reason: "The deck has no visible slides to present." };
    const slideId = param(raw, "slideId");
    if (slideId !== undefined && !visible.includes(slideId)) return { changed: false, ids: [], reason: "slideId must identify a visible slide in this deck." };
    if (slideId !== undefined) { data.activeSlideId = slideId; block.data = data; }
    state.camera = { ...current, focus: { seq, mode: "present", blockIds: [blockId], presentation: "slides" } };
    return { changed: true, ids: [blockId!] };
  }
  const requested = ["blockId", "target"].some((key) => param(raw, key) !== undefined);
  if (requested) return { changed: false, ids: [], reason: "The requested slide deck was not found." };
  const frames = (Array.isArray(state.frames) ? state.frames : []).map(record).filter((frame) => frame.hiddenInPresentation !== true).sort((a, b) => Number(a.order) - Number(b.order));
  if (!frames.length) return { changed: false, ids: [], reason: "Create a visible frame before presenting the board." };
  const target = resolveFrameCamera(state, raw);
  if (target.named && (!target.frame || !target.camera || target.frame.hiddenInPresentation === true)) return { changed: false, ids: [], reason: target.reason ?? "That frame is hidden from presentation." };
  const frameId = target.frame?.id ?? String(frames[0].id);
  state.camera = { ...current, focus: { seq, mode: "present", blockIds: [], presentation: "frames", frameId } };
  return { changed: true, ids: [frameId] };
}
