"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, FileText, ImagePlus, Presentation, Table2, LayoutGrid } from "lucide-react";
import { createCollection } from "../collections/model";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { type CanvasBlock, createBlockId, createDualTransform } from "../types/block";
import { getLegacyTableTransform } from "../utils/workspaceTablePlacement";
import { normalizeSlideDeckData } from "../utils/slideDeckOps";
import { createWorkspaceTableBlock } from "../utils/workspaceTableFactory";
import { WorkspaceImageFlowToolbar } from "./WorkspaceImageFlowToolbar";
import { isImageFlowBlock } from "../types/imageFlow";

/** Single "Insert" trigger on the workspace tool rail that opens a small
 *  flyout for the non-shape block types (rich-text doc, table, slide deck) —
 *  grouped together so the rail doesn't grow one button per block type. */
export function WorkspaceInsertPanel() {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);

  const [isOpen, setIsOpen] = useState(false);
  const [isImageFlowOpen, setIsImageFlowOpen] = useState(false);
  const [dismissedSelection, setDismissedSelection] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedFlowBlockId = selectedBlockIds.length === 1 && isImageFlowBlock(blocks[selectedBlockIds[0]])
    ? selectedBlockIds[0]
    : null;
  const selectionSignature = selectedBlockIds.join(",");
  const showImageFlowToolbar = isImageFlowOpen || Boolean(selectedFlowBlockId && dismissedSelection !== selectionSignature);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const handleAddTable = useCallback((mode: "document" | "spreadsheet") => {
    const block: CanvasBlock<"table"> = createWorkspaceTableBlock(createDualTransform(getLegacyTableTransform(blocks)), mode);
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blocks, setSelection]);

  const handleAddSlides = useCallback(() => {
    const now = Date.now();
    const block: CanvasBlock<"slideDeck"> = {
      id: createBlockId(),
      type: "slideDeck",
      transform: createDualTransform(getLegacyTableTransform(blocks)),
      data: normalizeSlideDeckData(undefined),
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blocks, setSelection]);

  const handleAddDoc = useCallback(() => {
    const now = Date.now();
    const block: CanvasBlock<"doc"> = {
      id: createBlockId(),
      type: "doc",
      transform: createDualTransform(getLegacyTableTransform(blocks)),
      data: { html: "" },
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
    setPendingEditBlockId(block.id);
  }, [addBlock, blocks, setSelection, setPendingEditBlockId]);

  const handleAddCollection = useCallback(() => {
    const now = Date.now();
    const transform = createDualTransform({ ...getLegacyTableTransform(blocks), w: 900, h: 540 });
    const block: CanvasBlock<"collection"> = { id: createBlockId(), type: "collection", transform, data: createCollection(), createdAt: now, updatedAt: now };
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blocks, setSelection]);

  const insertActions = [
    { label: "Add Collection", Icon: LayoutGrid, onClick: handleAddCollection },
    { label: "Add Doc", Icon: FileText, onClick: handleAddDoc },
    { label: "Add Table", Icon: Table2, onClick: () => handleAddTable("document") },
    { label: "Add Spreadsheet", Icon: Calculator, onClick: () => handleAddTable("spreadsheet") },
    { label: "Add Slides", Icon: Presentation, onClick: handleAddSlides },
    { label: "Image Flow", Icon: ImagePlus, onClick: () => setIsImageFlowOpen(true) },
  ];

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-8 w-8 items-center justify-center rounded-xl p-2 transition-all cursor-pointer ${
          isOpen
            ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 ring-2 ring-orange-400/30"
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
        }`}
        title="Insert content"
        aria-label="Insert content"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <FileText className="w-4 h-4" />
      </button>
      {isOpen && (
        <div role="group" aria-label="Insert block" className="absolute left-full top-0 pl-2 z-50">
          <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
            {insertActions.map(({ label, Icon, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onClick();
                  setIsOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                title={label}
                aria-label={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      )}
      {showImageFlowToolbar && (
        <WorkspaceImageFlowToolbar
          onClose={() => {
            setIsImageFlowOpen(false);
            setDismissedSelection(selectionSignature);
          }}
        />
      )}
    </div>
  );
}

export default WorkspaceInsertPanel;
