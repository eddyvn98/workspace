"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type CanvasBlock,
  createBlockId,
  createDualTransform,
} from "../types/block";
import {
  extractWorkspacePastedImageSize,
  extractWorkspacePastedImageUrl,
  fitWorkspaceImageSize,
  isWorkspaceHostedImageUrl,
  readWorkspaceImageSize,
} from "../utils/workspaceImageClipboard";
import { fetchAndRehostWorkspaceImage } from "../utils/imageUpload";
import { fileAttachmentUnderBoard } from "../utils/workspaceDocumentFiling";

/**
 * Files a pasted image under the board (same side-upload as a chat attachment)
 * so the AI can read what it shows instead of only seeing a block. Best-effort:
 * a failed download or upload never affects the pasted block.
 */
async function fileHostedImageUnderBoard(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return;
    const extension = blob.type.split("/")[1]?.split("+")[0] || "png";
    const file = new File([blob], `pasted-image.${extension}`, { type: blob.type });
    await fileAttachmentUnderBoard(useWorkspaceStore.getState().boardId, file);
  } catch {
    // Nothing to report: the block is already on the canvas.
  }
}

function addPastedImage(url: string, naturalSize: { width: number; height: number } | undefined, alt: string): void {
  const { blocks, addBlock, setSelection } = useWorkspaceStore.getState();
  const size = fitWorkspaceImageSize(naturalSize);
  const blockCount = Object.keys(blocks).length;
  const newId = createBlockId();
  const now = Date.now();
  const newBlock: CanvasBlock<"image"> = {
    id: newId,
    type: "image",
    transform: createDualTransform({
      x: 120,
      y: 120,
      w: size.width,
      h: size.height,
      rotation: 0,
      zIndex: blockCount,
    }),
    data: { url, alt },
    createdAt: now,
    updatedAt: now,
  };
  addBlock(newBlock);
  setSelection([newId]);
}

/**
 * Hook to handle pasting images directly from the OS clipboard onto the canvas.
 */
export function useImagePasteFromClipboard(): void {
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          Boolean(target.closest?.("[contenteditable]")))
      ) {
        return;
      }

      const clipboard = event.clipboardData;
      const items = clipboard?.items;
      if (!clipboard || !items) return;

      let imageItem: DataTransferItem | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          imageItem = item;
          break;
        }
      }

      const html = clipboard.getData("text/html");
      const pastedText = clipboard.getData("text/plain") || clipboard.getData("text");
      const pastedUrl = extractWorkspacePastedImageUrl(pastedText, html);
      const pastedSize = extractWorkspacePastedImageSize(html);
      if (!imageItem && !pastedUrl) return;

      event.preventDefault();
      if (pastedUrl) {
        void Promise.all([
          isWorkspaceHostedImageUrl(pastedUrl) ? Promise.resolve(pastedUrl) : fetchAndRehostWorkspaceImage(pastedUrl),
          readWorkspaceImageSize(pastedUrl),
        ]).then(([hostedUrl, naturalSize]) => {
          addPastedImage(hostedUrl ?? pastedUrl, pastedSize ?? naturalSize, "Pasted image");
          if (hostedUrl && isWorkspaceHostedImageUrl(hostedUrl)) void fileHostedImageUnderBoard(hostedUrl);
        });
        return;
      }

      const file = imageItem?.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result;
        if (typeof dataUrl !== "string" || !dataUrl) return;
        void readWorkspaceImageSize(file).then((naturalSize) => {
          addPastedImage(dataUrl, naturalSize, file.name || "Pasted image");
          void fileAttachmentUnderBoard(useWorkspaceStore.getState().boardId, file);
        });
      };

      reader.readAsDataURL(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
}

export default useImagePasteFromClipboard;
