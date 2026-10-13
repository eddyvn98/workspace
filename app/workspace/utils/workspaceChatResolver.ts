"use client";

import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockStyle, CanvasBlock } from "../types/block";
import { normalizeWorkspaceTextDataStyle, type WorkspaceTextDataStylePatch } from "./workspaceChatTextStyle";

export interface NormalizedTargetRef {
  mode: "id" | "selected" | "root" | "topic";
  id?: string;
  topic?: string;
}

export interface NormalizedLegacyPayload {
  title?: string;
  description?: string;
  style?: BlockStyle;
  x?: number;
  y?: number;
  textData?: WorkspaceTextDataStylePatch;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const VALID_BORDER_WIDTHS = new Set([1, 1.5, 2, 3]);
const VALID_BORDER_DASH = new Set(["solid", "dashed", "dotted"]);

export function normalizeStyle(raw: unknown): BlockStyle | undefined {
  const value = asRecord(raw);
  const style: BlockStyle = {};
  if (typeof value.backgroundColor === "string") style.backgroundColor = value.backgroundColor;
  if (typeof value.bgColor === "string") style.backgroundColor = value.bgColor;
  if (typeof value.backgroundOpacity === "number" && Number.isFinite(value.backgroundOpacity)) {
    style.backgroundOpacity = value.backgroundOpacity;
  }
  if (typeof value.borderColor === "string") style.borderColor = value.borderColor;
  if (typeof value.textColor === "string") style.textColor = value.textColor;
  if (typeof value.color === "string") style.textColor = value.color;
  // These five were parsed nowhere: the toolbar's own style menu can set all
  // of them, but a chat "update_style" action silently dropped them even
  // when the model asked for one — not an unsupported feature, just an
  // unwired one.
  if (typeof value.shapeKind === "string") style.shapeKind = value.shapeKind as BlockStyle["shapeKind"];
  if (VALID_BORDER_WIDTHS.has(value.borderWidth as number)) style.borderWidth = value.borderWidth as BlockStyle["borderWidth"];
  if (VALID_BORDER_DASH.has(value.borderDash as string)) style.borderDash = value.borderDash as BlockStyle["borderDash"];
  if (typeof value.flipH === "boolean") style.flipH = value.flipH;
  if (typeof value.flipV === "boolean") style.flipV = value.flipV;
  return Object.keys(style).length > 0 ? style : undefined;
}

export function getBlockTopic(block: CanvasBlock): string {
  if (!block || !block.data) return "";
  const data = block.data as Record<string, unknown>;
  if (block.type === "text" && typeof data.markdown === "string") {
    return data.markdown.trim();
  }
  const str = firstString(data.topic, data.label, data.title, data.name, data.text, data.markdown, data.alt);
  return str ?? "";
}

export function getBlockAncestorPath(blockId: string, blocks: Record<string, CanvasBlock>): string[] {
  const path: string[] = [];
  let curr: CanvasBlock | undefined = blocks[blockId];
  const visited = new Set<string>();
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    const topic = getBlockTopic(curr);
    if (topic) path.unshift(topic);
    curr = curr.parentId ? blocks[curr.parentId] : undefined;
  }
  return path;
}

export function normalizeTargetRef(raw: Record<string, unknown>): NormalizedTargetRef | undefined {
  const params = asRecord(raw.params);
  const targetVal = raw.target ?? params.target;
  const explicitId = firstString(raw.id, raw.blockId, raw.node_id, raw.nodeId, params.id, params.blockId, params.node_id, params.nodeId);

  if (typeof targetVal === "string") {
    const trimmed = targetVal.trim();
    if (!trimmed) return explicitId ? { mode: "id", id: explicitId } : undefined;
    const lower = trimmed.toLowerCase();
    if (lower === "root" || lower === "current") {
      return { mode: "root" };
    }
    if (lower === "selected") {
      return { mode: "selected" };
    }
    return { mode: "topic", topic: trimmed };
  }

  if (targetVal && typeof targetVal === "object") {
    const t = targetVal as Record<string, unknown>;
    const mode = typeof t.mode === "string" ? t.mode.toLowerCase() : undefined;
    if (mode === "root") return { mode: "root" };
    if (mode === "selected") return { mode: "selected" };
    if (mode === "id") {
      const id = firstString(t.id, explicitId);
      return id ? { mode: "id", id } : undefined;
    }
    if (mode === "topic") {
      const topic = firstString(t.topic, t.name, t.text, t.label);
      return topic ? { mode: "topic", topic } : undefined;
    }
    const id = firstString(t.id, explicitId);
    if (id) return { mode: "id", id };
    const topic = firstString(t.topic, t.name, t.text, t.label);
    if (topic) return { mode: "topic", topic };
  }

  if (explicitId) {
    return { mode: "id", id: explicitId };
  }

  const modeParam = firstString(raw.mode, params.mode);
  if (modeParam === "selected") return { mode: "selected" };
  if (modeParam === "root") return { mode: "root" };

  const styleScope = firstString(raw.styleScope, params.styleScope);
  if (styleScope?.toLowerCase() === "selected") {
    return { mode: "selected" };
  }

  return undefined;
}

export function resolveWorkspaceTargetIds(
  raw: Record<string, unknown>,
  options: { allowMultiple?: boolean } = {}
): string[] {
  const state = useWorkspaceStore.getState();
  const blocks = state.blocks;
  const targetRef = normalizeTargetRef(raw);

  if (!targetRef) {
    if (state.selectedBlockIds.length === 1 && blocks[state.selectedBlockIds[0]]) {
      return [state.selectedBlockIds[0]];
    }
    return [];
  }

  if (targetRef.mode === "id") {
    if (targetRef.id && blocks[targetRef.id]) {
      return [targetRef.id];
    }
    return [];
  }

  if (targetRef.mode === "selected") {
    const selected = state.selectedBlockIds.filter((id) => Boolean(blocks[id]));
    if (options.allowMultiple) return selected;
    if (selected.length === 1) return [selected[0]];
    return [];
  }

  if (targetRef.mode === "root") {
    if (state.selectedBlockIds.length > 0) {
      const selectedId = state.selectedBlockIds[0];
      let curr = blocks[selectedId];
      const visited = new Set<string>();
      while (curr?.parentId && blocks[curr.parentId] && !visited.has(curr.parentId)) {
        visited.add(curr.id);
        curr = blocks[curr.parentId];
      }
      if (curr) return [curr.id];
    }

    const rootBlocks = Object.values(blocks).filter((b) => !b.parentId || !blocks[b.parentId]);
    if (rootBlocks.length === 1) {
      return [rootBlocks[0].id];
    }
    return [];
  }

  if (targetRef.mode === "topic" && targetRef.topic) {
    if (blocks[targetRef.topic]) {
      return [targetRef.topic];
    }
    const rawTopic = targetRef.topic.trim();
    const pathSegments = rawTopic
      .split(/>|→/)
      .map((s) => s.replace(/^["'""\s]+|["'""\s]+$/g, "").trim())
      .filter(Boolean);

    if (pathSegments.length === 0) return [];

    const normalizedSegments = pathSegments.map((s) => s.toLowerCase());
    const matches = Object.values(blocks).filter((block) => {
      const blockTopic = getBlockTopic(block);
      if (!blockTopic) return false;

      if (normalizedSegments.length === 1) {
        return blockTopic.toLowerCase() === normalizedSegments[0];
      }

      const path = getBlockAncestorPath(block.id, blocks);
      if (path.length < normalizedSegments.length) return false;
      const suffix = path.slice(-normalizedSegments.length).map((s) => s.toLowerCase());
      return suffix.every((segment, idx) => segment === normalizedSegments[idx]);
    });

    if (matches.length === 1) {
      return [matches[0].id];
    }
    return [];
  }

  return [];
}

export function normalizeLegacyActionPayload(raw: Record<string, unknown>): NormalizedLegacyPayload {
  const params = asRecord(raw.params);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  const firstNode = asRecord(nodes[0] ?? raw.node ?? raw.to ?? params.node ?? params.to);

  const title = firstString(
    raw.title,
    raw.topic,
    raw.name,
    params.title,
    params.topic,
    params.name,
    firstNode.topic,
    firstNode.name,
    firstNode.text,
    firstNode.label,
    firstNode.title,
  );

  const description = firstString(
    raw.description,
    params.description,
    firstNode.description,
  );

  const style = normalizeStyle(raw.style ?? params.style ?? firstNode.style);
  const textData = normalizeWorkspaceTextDataStyle(raw.style ?? params.style ?? firstNode.style);
  const x = asNumber(raw.x ?? params.x ?? firstNode.x);
  const y = asNumber(raw.y ?? params.y ?? firstNode.y);

  return { title, description, style, x, y, ...(Object.keys(textData).length ? { textData } : {}) };
}
