"use client";

import { useCallback, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type BlockId,
  type CanvasBlock,
  type Transform,
  createBlockId,
  createDualTransform,
  resolveTransform,
} from "../types/block";
import { loadPdfDocument, renderPdfPageToBlob } from "../utils/pdfPages";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 220, h: 280, rotation: 0, zIndex: 0 };
const PAGE_DISPLAY_WIDTH = 220;
const GAP = 24;

async function uploadPageImage(blob: Blob, pageNumber: number): Promise<string> {
  const formData = new FormData();
  formData.append("file", new File([blob], `page-${pageNumber}.png`, { type: "image/png" }));
  const res = await fetch("/api/workspace-images", { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Page ${pageNumber} upload failed with status ${res.status}`);
  const data = await res.json();
  if (typeof data?.url !== "string" || !data.url) throw new Error(`Page ${pageNumber} upload returned no URL`);
  return data.url;
}

/** "Extract" turns one PDF-shaped `file` block into a row of `image` blocks,
 *  one per page — a static rasterization (see the plan's Q&A), not a live
 *  per-page PDF embed, since that's simpler and matches what the user asked
 *  to replicate. Modeled on `duplicateBlock` in useBlockContextMenuActions.ts
 *  (reads/writes the store directly rather than through a block's own
 *  onChange, since this creates N new top-level blocks and removes the
 *  source one) and the block-placement shape in useImageDropFromOS.ts. */
export function useExtractPdfPages() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = useCallback(async (blockId: BlockId, previewUrl: string) => {
    setIsExtracting(true);
    try {
      const doc = await loadPdfDocument(previewUrl);
      const { blocks, addBlock, removeBlock, setSelection } = useWorkspaceStore.getState();
      const sourceBlock = blocks[blockId];
      if (!sourceBlock) return;
      const origin = resolveTransform(sourceBlock.transform, DEFAULT_TRANSFORM);

      let cursorX = origin.x;
      const newIds: BlockId[] = [];
      const blockCountAtStart = Object.keys(blocks).length;
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const { blob, size } = await renderPdfPageToBlob(doc, pageNumber, PAGE_DISPLAY_WIDTH);
        const url = await uploadPageImage(blob, pageNumber);
        const newId = createBlockId();
        const now = Date.now();
        const newBlock: CanvasBlock<"image"> = {
          id: newId,
          type: "image",
          transform: createDualTransform({
            x: cursorX,
            y: origin.y,
            w: size.width,
            h: size.height,
            rotation: 0,
            zIndex: blockCountAtStart + pageNumber,
          }),
          data: { url, alt: `Page ${pageNumber}` },
          createdAt: now,
          updatedAt: now,
        };
        addBlock(newBlock);
        newIds.push(newId);
        cursorX += size.width + GAP;
      }

      removeBlock(blockId);
      setSelection(newIds);
    } catch (err) {
      console.error("Extract PDF pages failed:", err);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  return { extract, isExtracting };
}

export default useExtractPdfPages;
