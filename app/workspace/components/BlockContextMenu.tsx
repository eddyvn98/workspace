"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Smile, Edit3, Plus, GitBranchPlus, ChevronDown, LayoutGrid } from "lucide-react";
import type { BlockDataMap, BlockId, CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useBlockContextMenuActions } from "../hooks/useBlockContextMenuActions";
import { usePathTransformActions } from "../hooks/usePathTransformActions";
import { BlockContextMenuItem } from "./BlockContextMenuItem";
import { STICKERS } from "../utils/stickerConstants";
import { uploadOrReadWorkspaceImage } from "../utils/imageUpload";
import { useTreeAutoArrange } from "../hooks/useTreeAutoArrange";
import { BlockContextImageFlyout } from "./BlockContextImageFlyout";
import { toggleBlockCollapse } from "../utils/toggleBlockCollapse";
import { arrangeMapContaining } from "../utils/arrangeMapContaining";
import { currentMapLayout } from "../layout/mapRoot";
import { officeEditorUrl, officeKindOfBlock } from "@/lib/office/catalog";

export interface BlockContextMenuProps {
  blockId: BlockId;
  position: { x: number; y: number };
  onClose: () => void;
  onEditDescription?: () => void;
  onEditLink?: () => void;
}

const dividerClass = "my-1 border-t border-slate-200 dark:border-slate-800";

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  blockId,
  position,
  onClose,
  onEditDescription,
  onEditLink,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [flyout, setFlyout] = useState<"icon" | "image" | null>(null);
  const {
    copyBlock,
    cutBlock,
    pasteBlock,
    canPaste,
    duplicateBlock,
    copyStyle,
    pasteStyle,
    applyToSiblings,
    applyToSameLevel,
    bringToFront,
    bringForward,
    sendBackward,
    sendToBack,
    deleteBlock,
    editDescription,
    editLink,
    removeLink,
    canPasteStyle,
  } = useBlockContextMenuActions(
    onEditDescription ? () => onEditDescription() : undefined,
    onEditLink ? () => onEditLink() : undefined
  );
  const { flipPath, offsetPath } = usePathTransformActions();
  const { addChildBlock, addSiblingBlock, splitBlockToNewMap } = useTreeAutoArrange();

  const blocks = useWorkspaceStore((state) => state.blocks);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const currentBlock = blocks[blockId];
  const officeKind = officeKindOfBlock(currentBlock);
  const boardId = useWorkspaceStore((state) => state.boardId);
  const isTreeBlock = currentBlock?.type === "text";
  const isFlowchart = currentBlock ? currentMapLayout(useWorkspaceStore.getState(), blockId).family === "flowchart" : false;
  const hasParent = Boolean(currentBlock?.parentId);
  const hasChildren = Object.values(blocks).some(b => b.parentId === blockId);
  const isCollapsed = Boolean(currentBlock?.isCollapsed);
  const hasDescription = Boolean(currentBlock?.description?.trim());
  const hasLink = Boolean(currentBlock?.link?.trim());
  const hasIcon = Boolean(currentBlock?.icon);
  const isPathBlock = currentBlock?.type === "path";
  const isImageBlock = currentBlock?.type === "image";
  const isMapRoot = isTreeBlock && !hasParent;

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left =
    typeof window !== "undefined"
      ? Math.min(position.x, window.innerWidth - (flyout ? 430 : 180))
      : position.x;
  const top =
    typeof window !== "undefined"
      ? Math.min(position.y, window.innerHeight - 380)
      : position.y;

  const close = (action: () => void) => () => {
    action();
    onClose();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isImageBlock) return;
    const url = await uploadOrReadWorkspaceImage(file);
    const latest = useWorkspaceStore.getState().blocks[blockId];
    if (!url || !latest || latest.type !== "image") return;
    const data = latest.data as BlockDataMap["image"];
    updateBlock(blockId, {
      data: {
        ...data,
        url: data.url || url,
        extraUrls: data.url ? [...(data.extraUrls ?? []), url] : data.extraUrls,
      } as CanvasBlock["data"],
    });
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="pointer-events-auto fixed z-[100] min-w-[160px] rounded-lg border border-slate-200 bg-white/95 py-1 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      {officeKind && boardId && <BlockContextMenuItem onClick={close(() => window.open(officeEditorUrl(officeKind, boardId, blockId), "_blank", "noopener,noreferrer"))}>Open in Office</BlockContextMenuItem>}

      {isTreeBlock && !isFlowchart && <>
        <BlockContextMenuItem onClick={close(() => setPendingEditBlockId(blockId))}>
          <span className="flex items-center w-full justify-between"><span className="flex items-center gap-2"><Edit3 className="h-3.5 w-3.5" />Edit title</span><span className="text-[10px] text-slate-400">F2</span></span>
        </BlockContextMenuItem>
      </>}

      <BlockContextMenuItem onClick={close(() => editDescription(blockId, onEditDescription))}>
        {hasDescription ? "Edit Description" : "Add Description"}
      </BlockContextMenuItem>
      <BlockContextMenuItem onClick={() => setFlyout(flyout === "icon" ? null : "icon")}>
        <span className="flex items-center justify-between"><span className="flex items-center gap-2"><Smile className="h-3.5 w-3.5" />Add Icon and Sticker</span><ChevronRight className="h-3.5 w-3.5" /></span>
      </BlockContextMenuItem>
      <BlockContextMenuItem onClick={() => setFlyout(flyout === "image" ? null : "image")}>
        <span className="flex items-center justify-between"><span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" />Add Image</span><ChevronRight className="h-3.5 w-3.5" /></span>
      </BlockContextMenuItem>
      <BlockContextMenuItem onClick={close(() => editLink(blockId, onEditLink))}>
        {hasLink ? "Edit Link" : "Add Link"}
      </BlockContextMenuItem>
      <div className={dividerClass} />

      {isTreeBlock && !isFlowchart && <>
        <BlockContextMenuItem onClick={close(() => addChildBlock(blockId))}>
          <span className="flex items-center w-full justify-between"><span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" />Add child</span><span className="text-[10px] text-slate-400">Tab</span></span>
        </BlockContextMenuItem>

        {hasParent && (
          <BlockContextMenuItem onClick={close(() => addSiblingBlock(blockId))}>
            <span className="flex items-center w-full justify-between"><span className="flex items-center gap-2"><GitBranchPlus className="h-3.5 w-3.5" />Add sibling</span><span className="text-[10px] text-slate-400">Enter</span></span>
          </BlockContextMenuItem>
        )}

        {!isMapRoot && (
          <BlockContextMenuItem onClick={close(() => arrangeMapContaining(blockId))}>
            <span className="flex items-center gap-2"><LayoutGrid className="h-3.5 w-3.5" />Auto arrange</span>
          </BlockContextMenuItem>
        )}

        {hasChildren && (
          <BlockContextMenuItem onClick={close(() => toggleBlockCollapse(blockId))}>
            <span className="flex items-center gap-2">
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {isCollapsed ? "Expand" : "Collapse"}
            </span>
          </BlockContextMenuItem>
        )}

        {hasParent && (
          <BlockContextMenuItem onClick={close(() => splitBlockToNewMap(blockId))}>
            Split
          </BlockContextMenuItem>
        )}

        <div className={dividerClass} />
      </>}

      <BlockContextMenuItem onClick={close(() => copyBlock(blockId))}>Copy</BlockContextMenuItem>
      {!isMapRoot && <BlockContextMenuItem onClick={close(() => cutBlock(blockId))}>Cut</BlockContextMenuItem>}
      {canPaste && <BlockContextMenuItem onClick={close(() => pasteBlock(blockId))}>Paste</BlockContextMenuItem>}
      <BlockContextMenuItem onClick={close(() => duplicateBlock(blockId))}>Duplicate</BlockContextMenuItem>
      <BlockContextMenuItem onClick={close(() => {
        const state = useWorkspaceStore.getState(), block = state.blocks[blockId];
        if (block && !state.isReadOnly) state.updateBlock(blockId, { style: { ...block.style, isLocked: !block.style?.isLocked } });
      })}>{currentBlock?.style?.isLocked ? "Unlock position" : "Lock position"}</BlockContextMenuItem>
      {hasLink && (
        <BlockContextMenuItem danger onClick={close(() => removeLink(blockId))}>
          Remove Link
        </BlockContextMenuItem>
      )}
      {isImageBlock && <BlockContextMenuItem onClick={() => fileInputRef.current?.click()}><span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" />Add Image Frame</span></BlockContextMenuItem>}

      {isPathBlock && (
        <>
          <div className={dividerClass} />
          <BlockContextMenuItem onClick={close(() => flipPath(blockId, "horizontal"))}>
            Flip Horizontal
          </BlockContextMenuItem>
          <BlockContextMenuItem onClick={close(() => flipPath(blockId, "vertical"))}>
            Flip Vertical
          </BlockContextMenuItem>
          <BlockContextMenuItem onClick={close(() => offsetPath(blockId))}>Offset</BlockContextMenuItem>
        </>
      )}

      <div className={dividerClass} />

      <BlockContextMenuItem onClick={close(() => copyStyle(blockId))}>Copy Style</BlockContextMenuItem>
      <BlockContextMenuItem disabled={!canPasteStyle} onClick={close(() => pasteStyle(blockId))}>
        Paste Style
      </BlockContextMenuItem>

      {hasParent && (
        <>
          <BlockContextMenuItem onClick={close(() => applyToSiblings(blockId))}>
            Apply to Siblings
          </BlockContextMenuItem>
          <BlockContextMenuItem onClick={close(() => applyToSameLevel(blockId))}>
            Apply to Same Level
          </BlockContextMenuItem>
        </>
      )}

      <div className={dividerClass} />

      <BlockContextMenuItem onClick={close(() => bringToFront(blockId))}>Bring to Front</BlockContextMenuItem>
      <BlockContextMenuItem onClick={close(() => bringForward(blockId))}>Bring Forward</BlockContextMenuItem>
      <BlockContextMenuItem onClick={close(() => sendBackward(blockId))}>Send Backward</BlockContextMenuItem>
      <BlockContextMenuItem onClick={close(() => sendToBack(blockId))}>Send to Back</BlockContextMenuItem>

      <div className={dividerClass} />

      {!isMapRoot && <BlockContextMenuItem danger onClick={close(() => deleteBlock(blockId))}>
          Delete
        </BlockContextMenuItem>}
      {flyout === "icon" && currentBlock && (
        <div className="absolute left-full top-0 ml-1.5 w-[236px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-1.5"><button type="button" onClick={() => setFlyout(null)} title="Back"><ChevronLeft className="h-3.5 w-3.5 text-slate-400" /></button><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Icons & Stickers</span></div>
          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">{STICKERS.map((emoji) => <button key={emoji} type="button" onClick={() => { updateBlock(blockId, { icon: emoji }); onClose(); }} className="flex h-8 w-8 items-center justify-center rounded text-base hover:bg-slate-100 dark:hover:bg-slate-800" title={emoji}>{emoji}</button>)}</div>
          {hasIcon && <button type="button" onClick={() => { updateBlock(blockId, { icon: undefined }); onClose(); }} className="mt-2 w-full text-left text-[10px] text-rose-500">Remove Icon</button>}
        </div>
      )}
      {flyout === "image" && currentBlock && <BlockContextImageFlyout block={currentBlock} onBack={() => setFlyout(null)} onClose={onClose} />}
    </div>
  );
};

export default BlockContextMenu;
