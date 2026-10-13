"use client";

import { ImageLightbox } from "@/components/features/chat/image-lightbox";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/**
 * Mounts the shared chat image lightbox (components/features/chat/image-lightbox.tsx
 * — a generic, non-mindmap-specific component, safe to reuse per
 * CONTRACTS.md) for workspace image blocks, mirroring the old app's
 * MindmapImageLightbox.tsx "store as bridge" pattern: reads
 * useWorkspaceStore.imageLightbox instead of a prop threaded through the
 * canvas/block-frame chain. Set by ImageBlock.tsx on double-click.
 */
export function WorkspaceImageLightbox() {
  const lightbox = useWorkspaceStore((s) => s.imageLightbox);
  const setImageLightbox = useWorkspaceStore((s) => s.setImageLightbox);
  if (!lightbox) return null;

  return (
    <ImageLightbox
      images={lightbox.urls.map((url) => ({ url, prompt: "" }))}
      index={lightbox.index}
      onClose={() => setImageLightbox(null)}
      onIndexChange={(index) => setImageLightbox({ ...lightbox, index })}
    />
  );
}

export default WorkspaceImageLightbox;
