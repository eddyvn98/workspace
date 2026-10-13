"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";

export interface BlockAttachedImagesProps {
  block: CanvasBlock;
  isReadOnly?: boolean;
}

export function BlockAttachedImages({ block, isReadOnly }: BlockAttachedImagesProps) {
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const setImageLightbox = useWorkspaceStore((state) => state.setImageLightbox);

  if (!block.attachedImages || block.attachedImages.length === 0) return null;

  const handleRemove = (indexToRemove: number) => {
    const newImages = block.attachedImages!.filter((_, i) => i !== indexToRemove);
    updateBlock(block.id, {
      attachedImages: newImages.length > 0 ? newImages : undefined,
    });
  };

  return (
    <div
      className="flex flex-col gap-2"
      style={{
        width: "100%",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {block.attachedImages.map((image, index) => (
        <div key={`${image.url}-${index}`} className="group relative rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {/* Preserve the uploaded image's intrinsic ratio inside this flexible attachment card. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.alt || ""}
            className="h-auto w-full rounded object-contain pointer-events-none"
            style={{ maxHeight: 200 }}
            draggable={false}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImageLightbox({
                urls: block.attachedImages!.map((item) => item.url),
                index,
              });
            }}
            className="absolute left-2 top-2 hidden rounded-full bg-slate-900/60 p-1 text-white hover:bg-slate-900 group-hover:flex"
            title="Open image"
            aria-label={`Open image ${index + 1}`}
          >
            <Search className="h-3 w-3" />
          </button>
          {!isReadOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(index);
              }}
              className="absolute right-2 top-2 hidden rounded-full bg-slate-900/60 p-1 text-white hover:bg-slate-900 group-hover:flex"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
