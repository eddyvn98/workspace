"use client";

import React, { useCallback } from "react";
import { Calculator, FileText, Image, Link2, Presentation, Table2, Type } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type CanvasBlock,
  createBlockId,
  createDualTransform,
} from "../types/block";
import { normalizeSlideDeckData } from "../utils/slideDeckOps";
import { createWorkspaceTableBlock } from "../utils/workspaceTableFactory";

export function WorkspaceAddBlockButtons({ compact = false }: { compact?: boolean }) {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);

  const blockCount = Object.keys(blocks).length;

  const handleAddText = useCallback(() => {
    const offset = (blockCount % 20) * 20;
    const now = Date.now();
    const block: CanvasBlock<"text"> = {
      id: createBlockId(),
      type: "text",
      transform: createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 180,
        h: 90,
        rotation: 0,
        zIndex: blockCount,
      }),
      data: { markdown: "" },
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
    setPendingEditBlockId(block.id);
  }, [addBlock, blockCount, setSelection, setPendingEditBlockId]);

  const handleAddImage = useCallback(() => {
    const offset = (blockCount % 20) * 20;
    const now = Date.now();
    const block: CanvasBlock<"image"> = {
      id: createBlockId(),
      type: "image",
      transform: createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 200,
        h: 150,
        rotation: 0,
        zIndex: blockCount,
      }),
      data: { url: "", alt: "" },
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blockCount, setSelection]);

  const handleAddLink = useCallback(() => {
    const offset = (blockCount % 20) * 20;
    const now = Date.now();
    const block: CanvasBlock<"link"> = {
      id: createBlockId(),
      type: "link",
      transform: createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 320,
        h: 220,
        rotation: 0,
        zIndex: blockCount,
      }),
      data: { url: "", title: "" },
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blockCount, setSelection]);

  const handleAddTable = useCallback((mode: "document" | "spreadsheet") => {
    const offset = (blockCount % 20) * 20;
    const block: CanvasBlock<"table"> = createWorkspaceTableBlock(createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 240,
        h: 140,
        rotation: 0,
        zIndex: blockCount,
      }), mode);
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blockCount, setSelection]);

  const handleAddDoc = useCallback(() => {
    const offset = (blockCount % 20) * 20;
    const now = Date.now();
    const block: CanvasBlock<"doc"> = {
      id: createBlockId(),
      type: "doc",
      transform: createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 360,
        h: 420,
        rotation: 0,
        zIndex: blockCount,
      }),
      data: { html: "" },
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
    setPendingEditBlockId(block.id);
  }, [addBlock, blockCount, setSelection, setPendingEditBlockId]);

  const handleAddSlides = useCallback(() => {
    const offset = (blockCount % 20) * 20;
    const now = Date.now();
    const block: CanvasBlock<"slideDeck"> = {
      id: createBlockId(),
      type: "slideDeck",
      transform: createDualTransform({
        x: 100 + offset,
        y: 100 + offset,
        w: 480,
        h: 360,
        rotation: 0,
        zIndex: blockCount,
      }),
      data: normalizeSlideDeckData(undefined),
      createdAt: now,
      updatedAt: now,
    };
    addBlock(block);
    setSelection([block.id]);
  }, [addBlock, blockCount, setSelection]);

  const actions = [
    { label: "Add Text", Icon: Type, onClick: handleAddText },
    { label: "Add Doc", Icon: FileText, onClick: handleAddDoc },
    { label: "Add Image", Icon: Image, onClick: handleAddImage },
    { label: "Add Link", Icon: Link2, onClick: handleAddLink },
    { label: "Add Table", Icon: Table2, onClick: () => handleAddTable("document") },
    { label: "Add Spreadsheet", Icon: Calculator, onClick: () => handleAddTable("spreadsheet") },
    { label: "Add Slides", Icon: Presentation, onClick: handleAddSlides },
  ];

  return actions.map(({ label, Icon, onClick }) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={
        compact
          ? "flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900 cursor-pointer"
          : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
      }
      title={label}
      aria-label={label}
    >
      {compact ? <Icon className="h-4 w-4" aria-hidden="true" /> : label}
    </button>
  ));
}

export default WorkspaceAddBlockButtons;
