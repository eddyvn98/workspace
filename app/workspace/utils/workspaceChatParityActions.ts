import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createDualTransform, resolveTransform, type CanvasBlock, type Transform } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { normalizeSlideDeckData } from "./slideDeckOps";
import { createWorkspaceTableBlock } from "./workspaceTableFactory";
import { asNumber, asRecord, firstString, resolveWorkspaceTargetIds } from "./workspaceChatResolver";
import { normalizeWorkspaceBlockZOrder, reorderWorkspaceBlockIds, type WorkspaceZOrderMode } from "./workspaceZOrder";

const CONTENT_TYPES = new Set(["text", "image", "link", "doc", "table", "slideDeck"]);
const DEFAULT_TRANSFORM: Transform = { x: 100, y: 100, w: 180, h: 90, rotation: 0, zIndex: 0 };

function targetIds(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const blockId = firstString(raw.blockId, asRecord(raw.params).blockId);
  if (blockId && state.blocks[blockId]) return [blockId];
  const explicit = Array.isArray(raw.ids) ? raw.ids.filter((id): id is string => typeof id === "string" && Boolean(state.blocks[id])) : [];
  return explicit.length ? explicit : resolveWorkspaceTargetIds(raw, { allowMultiple: true });
}

function transformFrom(raw: Record<string, unknown>, index: number, type?: string): Transform {
  const source = asRecord(raw.transform);
  const value = (key: string, ...aliases: string[]) => aliases.map((alias) => asNumber(source[alias] ?? raw[alias])).find((item) => item !== undefined);
  const defaults: Record<string, [number, number]> = { image: [200, 150], link: [320, 220], doc: [360, 420], table: [240, 140], slideDeck: [480, 360] };
  const [defaultWidth, defaultHeight] = defaults[type ?? ""] ?? [DEFAULT_TRANSFORM.w, DEFAULT_TRANSFORM.h];
  return {
    x: value("x") ?? DEFAULT_TRANSFORM.x + index * 24,
    y: value("y") ?? DEFAULT_TRANSFORM.y + index * 24,
    w: value("w", "width") ?? defaultWidth,
    h: value("h", "height") ?? defaultHeight,
    rotation: value("rotation") ?? DEFAULT_TRANSFORM.rotation,
    zIndex: value("zIndex") ?? index,
  };
}

function createContentBlock(raw: Record<string, unknown>): CanvasBlock | undefined {
  const state = useWorkspaceStore.getState();
  const draft = asRecord(raw.block);
  const type = firstString(raw.blockType, draft.type);
  if (!type || !CONTENT_TYPES.has(type)) return undefined;
  const source = asRecord(raw.data ?? draft.data);
  const transform = createDualTransform(transformFrom(raw, Object.keys(state.blocks).length, type));
  const now = Date.now();
  const common = { id: firstString(raw.id, draft.id) ?? createBlockId(), transform, createdAt: now, updatedAt: now };
  if (type === "text") return { ...common, type: "text", data: { markdown: firstString(source.markdown, raw.text) ?? "" } } as CanvasBlock;
  if (type === "image") return { ...common, type: "image", data: { url: firstString(source.url, raw.url) ?? "", alt: firstString(source.alt, raw.alt) ?? "" } } as CanvasBlock;
  if (type === "link") return { ...common, type: "link", data: { url: firstString(source.url, raw.url) ?? "", title: firstString(source.title, raw.title) ?? "" } } as CanvasBlock;
  if (type === "doc") return { ...common, type: "doc", data: { html: typeof source.html === "string" ? source.html : "" } } as CanvasBlock;
  if (type === "table") {
    const mode = source.mode === "spreadsheet" ? "spreadsheet" : "document";
    const block = createWorkspaceTableBlock(transform, mode);
    return { ...block, id: common.id, createdAt: now, updatedAt: now, data: { ...block.data, ...source } };
  }
  return { ...common, type: "slideDeck", data: normalizeSlideDeckData(source as never) } as CanvasBlock;
}

function applyTransform(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const source = asRecord(raw.transform);
  const relativeToId = firstString(raw.relativeToBlockId, asRecord(raw.params).relativeToBlockId);
  const placement = firstString(raw.placement, asRecord(raw.params).placement)?.toLowerCase();
  const reference = relativeToId ? state.blocks[relativeToId] : undefined;
  const ids = targetIds(raw);
  if (placement) {
    if (!reference || !["left", "right", "above", "below"].includes(placement) || ids.includes(relativeToId!)) return [];
    const referenceRect = resolveTransform(reference.transform, DEFAULT_TRANSFORM);
    const gap = Math.max(0, Math.min(500, asNumber(raw.gap) ?? 64));
    ids.forEach((id) => {
      const block = state.blocks[id];
      if (!block) return;
      const rect = resolveTransform(block.transform, DEFAULT_TRANSFORM);
      const position = placement === "left"
        ? { x: referenceRect.x - rect.w - gap, y: referenceRect.y + (referenceRect.h - rect.h) / 2 }
        : placement === "right"
          ? { x: referenceRect.x + referenceRect.w + gap, y: referenceRect.y + (referenceRect.h - rect.h) / 2 }
          : placement === "above"
            ? { x: referenceRect.x + (referenceRect.w - rect.w) / 2, y: referenceRect.y - rect.h - gap }
            : { x: referenceRect.x + (referenceRect.w - rect.w) / 2, y: referenceRect.y + referenceRect.h + gap };
      const candidate = { ...rect, ...position };
      const step = gap + 32;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const collision = Object.values(state.blocks).some((other) => {
          if (other.id === id || other.id === relativeToId) return false;
          const otherRect = resolveTransform(other.transform, DEFAULT_TRANSFORM);
          return candidate.x < otherRect.x + otherRect.w + 24 && candidate.x + candidate.w + 24 > otherRect.x
            && candidate.y < otherRect.y + otherRect.h + 24 && candidate.y + candidate.h + 24 > otherRect.y;
        });
        if (!collision) break;
        if (placement === "left") candidate.x -= step;
        else if (placement === "right") candidate.x += step;
        else if (placement === "above") candidate.y -= step;
        else candidate.y += step;
      }
      state.updateBlockTransform(id, { x: candidate.x, y: candidate.y }, "override");
    });
    return ids;
  }
  const number = (key: string, ...aliases: string[]) => [key, ...aliases].map((alias) => asNumber(source[alias] ?? raw[alias])).find((item) => item !== undefined);
  const patch: Partial<Transform> = {};
  const x = number("x"); const y = number("y"); const w = number("w", "width"); const h = number("h", "height");
  const rotation = number("rotation"); const zIndex = number("zIndex");
  if (x !== undefined) patch.x = x;
  if (y !== undefined) patch.y = y;
  if (w !== undefined) patch.w = w;
  if (h !== undefined) patch.h = h;
  if (rotation !== undefined) patch.rotation = rotation;
  if (zIndex !== undefined) patch.zIndex = zIndex;
  if (!Object.keys(patch).length) return [];
  ids.forEach((id) => state.updateBlockTransform(id, patch, "override"));
  return ids;
}

function applyZOrder(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const ids = targetIds(raw).filter((id) => state.blockOrder.includes(id));
  const mode = (firstString(raw.zOrder, raw.order, raw.action) ?? "front").toLowerCase();
  if (state.isReadOnly || !ids.length || !["front", "forward", "back", "backward"].includes(mode)) return [];
  const order = reorderWorkspaceBlockIds(state.blockOrder, ids, mode as WorkspaceZOrderMode);
  useWorkspaceStore.setState({ blockOrder: order, blocks: normalizeWorkspaceBlockZOrder(state.blocks, order) });
  return ids;
}

function disconnect(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const connectorId = firstString(raw.connectorId, asRecord(raw.params).connectorId);
  const from = firstString(raw.fromBlockId) ?? resolveWorkspaceTargetIds({ target: raw.from }, { allowMultiple: false })[0];
  const to = firstString(raw.toBlockId) ?? resolveWorkspaceTargetIds({ target: raw.to }, { allowMultiple: false })[0];
  const matches = Object.values(state.connectors).filter((connector) => connectorId
    ? connector.id === connectorId
    : Boolean(from && to && connector.fromBlockId === from && connector.toBlockId === to));
  matches.forEach((connector: CanvasConnector) => state.removeConnector(connector.id));
  return matches.map((connector) => connector.id);
}

export function applyWorkspaceParityChatAction(raw: Record<string, unknown>): string[] | undefined {
  const type = String(raw.type ?? "").toLowerCase();
  if (type === "create_block") {
    const block = createContentBlock(raw);
    if (!block) return [];
    const state = useWorkspaceStore.getState();
    state.addBlock(block);
    state.setSelection([block.id]);
    return [block.id];
  }
  if (type === "update_transform") return applyTransform(raw);
  if (type === "update_z_order") return applyZOrder(raw);
  if (type === "disconnect_nodes") return disconnect(raw);
  return undefined;
}
