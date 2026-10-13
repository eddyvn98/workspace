import { collectReferencedBlockIds } from "./blockReferences";

type Block = { type?: unknown; parentId?: unknown; isFloating?: unknown; data?: unknown; style?: unknown; transform?: unknown };
type Blocks = Record<string, Block>;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
export function frameMembers(block?: Block): string[] | undefined {
  const ids = record(block?.data).frameBlockIds;
  return block?.type === "shape" && Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : undefined;
}
export function frameGeometry(block: Block) {
  const t = record(block.transform), r = { ...record(t.computed), ...record(t.override) };
  return { x: Number(r.x) || 0, y: Number(r.y) || 0, w: Math.max(1, Number(r.w) || 160), h: Math.max(1, Number(r.h) || 80), rotation: Number(r.rotation) || 0 };
}
function locked(block: Block) { return record(block.style).isLocked === true; }
function auto(block: Block) { return record(block.data).frameAutoMembership !== false; }
function contains(frame: Block, block: Block) {
  const f = frameGeometry(frame), b = frameGeometry(block);
  const angle = -f.rotation * Math.PI / 180;
  const dx = b.x + b.w / 2 - f.x - f.w / 2, dy = b.y + b.h / 2 - f.y - f.h / 2;
  const x = dx * Math.cos(angle) - dy * Math.sin(angle), y = dx * Math.sin(angle) + dy * Math.cos(angle);
  const marginX = frameMembers(block) ? b.w / 2 : 0, marginY = frameMembers(block) ? b.h / 2 : 0;
  return Math.abs(x) + marginX <= f.w / 2 && Math.abs(y) + marginY <= f.h / 2;
}

/** Membership is independent of mindmap parents. Carried contents stay with their moving frame. */
export function planFrameDrop(blocks: Blocks, movedIds: Iterable<string>): Map<string, string[]> {
  const moved = new Set(movedIds), frames = Object.keys(blocks).filter((id) => frameMembers(blocks[id]) !== undefined);
  if (!frames.length) return new Map();
  const carried = new Set<string>();
  for (const id of moved) if (frameMembers(blocks[id])) {
    for (const member of collectReferencedBlockIds(blocks, [id])) if (member !== id) carried.add(member);
  }
  const plan = new Map<string, string[]>();
  for (const id of moved) {
    const block = blocks[id];
    if (!block || locked(block) || carried.has(id) || (block.parentId && !block.isFloating)) continue;
    const owners = frames.filter((frameId) => frameMembers(blocks[frameId])!.includes(id));
    if (owners.some((owner) => locked(blocks[owner]) || !auto(blocks[owner]))) continue;
    const descendants = new Set(collectReferencedBlockIds(blocks, [id]));
    const candidates = frames.filter((frameId) => !descendants.has(frameId) && !locked(blocks[frameId]) && auto(blocks[frameId]) && contains(blocks[frameId], block));
    candidates.sort((a, b) => {
      const x = frameGeometry(blocks[a]), y = frameGeometry(blocks[b]);
      return x.w * x.h - y.w * y.h || a.localeCompare(b);
    });
    const target = candidates[0];
    for (const owner of owners) if (owner !== target) plan.set(owner, (plan.get(owner) ?? frameMembers(blocks[owner])!).filter((member) => member !== id));
    if (target) {
      const members = plan.get(target) ?? frameMembers(blocks[target])!;
      if (!members.includes(id)) plan.set(target, [...members, id]);
    }
  }
  return plan;
}

export function fitContainerToContents(blocks: Blocks, frameId: string, padding = 40) {
  const frame = blocks[frameId], members = frameMembers(frame);
  if (!frame || locked(frame) || !members?.length) return;
  const rects = members.filter((id) => !!blocks[id] && id !== frameId).map((id) => frameGeometry(blocks[id]));
  if (!rects.length || frameGeometry(frame).rotation) return;
  const x = Math.min(...rects.map((r) => r.x)) - padding, y = Math.min(...rects.map((r) => r.y)) - padding;
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) + padding - x, h: Math.max(...rects.map((r) => r.y + r.h)) + padding - y };
}

export function addContainerMembers(blocks: Blocks, frameId: string, ids: string[]): string[] | undefined {
  const frame = blocks[frameId], members = frameMembers(frame);
  if (!frame || locked(frame) || !members || ids.some((id) => !blocks[id] || locked(blocks[id]) || collectReferencedBlockIds(blocks, [id]).includes(frameId))) return;
  return [...new Set([...members.filter((id) => !!blocks[id]), ...ids])];
}
