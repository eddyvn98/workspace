"use client";

import React from "react";
import Image from "next/image";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { applyBackgroundOpacity } from "../utils/colorOpacity";

export const ImageBlock: React.FC<BlockRendererProps<"image">> = ({
  block,
  isSelected,
}) => {
  // "contain" (never "cover"): the frame can be resized to any shape
  // (freeform, no Ctrl) independent of the image's own ratio, and the
  // image must never crop/warp to fill it — it always scales down to fit
  // fully inside, letterboxing if the frame's ratio doesn't match.
  const { url = "", alt = "", fit = "contain" } = block.data ?? {};
  const setImageLightbox = useWorkspaceStore((s) => s.setImageLightbox);
  const setImageNaturalAspect = useWorkspaceStore((s) => s.setImageNaturalAspect);

  const handleOpenLightbox = () => {
    if (!url) return;
    setImageLightbox({ urls: [url], index: 0 });
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageNaturalAspect(block.id, img.naturalWidth / img.naturalHeight);
    }
  };

  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#f8fafc",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor =
    block.style?.borderColor ?? (isSelected ? "#2563eb" : "#cbd5e1");
  const borderWidth = isSelected ? "2px" : "1px";

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        handleOpenLightbox();
      }}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        position: "relative",
        borderRadius: "6px",
        overflow: "hidden",
        backgroundColor,
        border: `${borderWidth} solid ${borderColor}`,
        boxShadow: isSelected
          ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
          : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: url ? "zoom-in" : undefined,
      }}
    >
      {url ? (
        <Image
          src={url}
          alt={alt || "Canvas image"}
          fill
          unoptimized
          sizes="100vw"
          onLoad={handleImageLoad}
          style={{
            width: "100%",
            height: "100%",
            objectFit: fit,
            display: "block",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ) : (
        <div
          style={{
            color: "#64748b",
            fontSize: "13px",
            userSelect: "none",
          }}
        >
          No image URL
        </div>
      )}
    </div>
  );
};

registerBlockRenderer("image", ImageBlock);
