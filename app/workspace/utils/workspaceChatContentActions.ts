"use client";

import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import { asNumber, asRecord, firstString, getBlockTopic, resolveWorkspaceTargetIds } from "./workspaceChatResolver";

function firstActionNode(raw: Record<string, unknown>): Record<string, unknown> {
  const params = asRecord(raw.params);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  return asRecord(nodes[0] ?? raw.node ?? params.node);
}

function imageUrl(raw: Record<string, unknown>, node: Record<string, unknown>): string | undefined {
  const params = asRecord(raw.params);
  return firstString(raw.image, params.image, node.image, node.url);
}

function imageAlt(block: CanvasBlock, node: Record<string, unknown>): string | undefined {
  return firstString(node.alt, node.topic, node.name, getBlockTopic(block));
}

function applyImage(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  if (targetIds.length !== 1) return [];

  const block = state.blocks[targetIds[0]];
  const node = firstActionNode(raw);
  const requestedImages = raw.images ?? asRecord(raw.params).images;
  const images: Array<{ url: string; alt?: string }> = Array.isArray(requestedImages)
    ? requestedImages.map(asRecord).reduce<Array<{ url: string; alt?: string }>>((items, item) => {
      const url = firstString(item.url);
      if (url) items.push({ url, ...(firstString(item.alt) ? { alt: firstString(item.alt) } : {}) });
      return items;
    }, [])
    : [];
  const removeIndex = asNumber(raw.removeImageIndex ?? asRecord(raw.params).removeImageIndex);
  if (images.length > 0 || removeIndex !== undefined) {
    const current = block.attachedImages ?? [];
    const next = images.length > 0 ? images : current.filter((_, index) => index !== removeIndex);
    if (block.type === "image" && images.length > 0) {
      const [first, ...extra] = images;
      state.updateBlock(block.id, { data: { ...(block.data as Record<string, unknown>), url: first.url, alt: first.alt, extraUrls: extra.map((item) => item.url) } as CanvasBlock["data"] });
    } else {
      state.updateBlock(block.id, { attachedImages: next.length > 0 ? next : undefined });
    }
    return [block.id];
  }
  const url = imageUrl(raw, node);
  if (!block || !url) return [];

  if (block.type === "image") {
    const data = block.data as Record<string, unknown>;
    state.updateBlock(block.id, {
      data: { ...data, url, alt: imageAlt(block, node) } as CanvasBlock["data"],
    });
  } else {
    state.updateBlock(block.id, {
      attachedImages: [{ url, alt: imageAlt(block, node) }],
    });
  }
  return [block.id];
}

function applyIcon(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  const node = firstActionNode(raw);
  const params = asRecord(raw.params);
  const icon = firstString(raw.icon, params.icon, node.icon);
  const removeIcon = raw.removeIcon === true || params.removeIcon === true || raw.icon === "" || params.icon === "";
  if (targetIds.length !== 1 || (!icon && !removeIcon) || !state.blocks[targetIds[0]]) return [];
  state.updateBlock(targetIds[0], { icon: removeIcon ? "" : icon });
  return [targetIds[0]];
}

export function applyWorkspaceContentChatAction(
  type: "update_image" | "update_icon",
  raw: Record<string, unknown>,
): string[] {
  if (type === "update_image") return applyImage(raw);
  return applyIcon(raw);
}
