"use client";

import React, { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { ChevronLeft, FileText, Image as ImageIcon, Link as LinkIcon, Smile, Trash2, Upload } from "lucide-react";
import { BlockLinkEditor } from "./BlockLinkEditor";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import { STICKERS } from "../utils/stickerConstants";
import { fetchAndRehostWorkspaceImage, uploadOrReadWorkspaceImage } from "../utils/imageUpload";
import { extractWorkspacePastedImageUrl, isWorkspaceHostedImageUrl } from "../utils/workspaceImageClipboard";

type ContentView = "root" | "sticker" | "image" | "link";

const itemClass = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800";

export interface WorkspaceNodeContentPopoverProps {
  block: CanvasBlock;
  placeBelow: boolean;
  onClose: () => void;
  onStartDescription: () => void;
}

export function WorkspaceNodeContentPopover({ block, placeBelow, onClose, onStartDescription }: WorkspaceNodeContentPopoverProps) {
  const [view, setView] = useState<ContentView>("root");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (view !== "image") return;
    const handlePaste = async (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))?.getAsFile();
      const clipboard = event.clipboardData;
      const url = extractWorkspacePastedImageUrl(clipboard?.getData("text/plain") || clipboard?.getData("text") || "", clipboard?.getData("text/html"));
      if (!file && !url) return;
      event.preventDefault();
      event.stopPropagation();
      setIsUploading(true);
      try {
        const imageUrl = file
          ? await uploadOrReadWorkspaceImage(file)
          : url && (isWorkspaceHostedImageUrl(url) ? url : (await fetchAndRehostWorkspaceImage(url)) ?? url);
        if (!imageUrl) return;
        const current = useWorkspaceStore.getState().blocks[block.id]?.attachedImages ?? [];
        useWorkspaceStore.getState().updateBlock(block.id, {
          attachedImages: [...current, { url: imageUrl, alt: file?.name || "Pasted image" }],
        });
      } finally {
        setIsUploading(false);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [block.id, view]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadOrReadWorkspaceImage(file);
      if (!url) return;
      const state = useWorkspaceStore.getState();
      const currentImages = block.attachedImages || [];
      state.updateBlock(block.id, {
        attachedImages: [...currentImages, { url, alt: file.name }],
      });
      onClose();
    } finally {
      setIsUploading(false);
    }
  };

  const goBack = () => setView("root");

  return (
    <SwatchPopover isOpen onClose={onClose} title="Node Content" placeBelow={placeBelow}>
      {view === "root" && (
        <div className="flex min-w-[200px] flex-col gap-0.5">
          <button type="button" className={itemClass} onClick={() => { onStartDescription(); onClose(); }}>
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />Add Description
          </button>
          <button type="button" className={itemClass} onClick={() => setView("sticker")}>
            <Smile className="h-3.5 w-3.5 shrink-0 text-slate-400" />Add Icon and Sticker
          </button>
          <button type="button" className={itemClass} onClick={() => setView("image")}>
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />Add Image
          </button>
          <button type="button" className={itemClass} onClick={() => setView("link")}>
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />{block.link ? "Edit Link" : "Add Link"}
          </button>
        </div>
      )}
      {view === "sticker" && (
        <div className="w-[236px]">
          <div className="mb-2.5 flex items-center gap-1.5">
            <button type="button" onClick={goBack} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back" aria-label="Back"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Icons &amp; Stickers</span>
            {block.icon && <button type="button" onClick={() => { useWorkspaceStore.getState().updateBlock(block.id, { icon: "" }); onClose(); }} className="text-[10px] text-rose-500 hover:text-rose-700">Remove</button>}
          </div>
          <div className="grid grid-cols-9 gap-0.5">
            {STICKERS.map((emoji) => <button key={emoji} type="button" title={emoji} onClick={() => { useWorkspaceStore.getState().updateBlock(block.id, { icon: emoji }); onClose(); }} className={`flex items-center justify-center rounded p-1 text-base leading-none hover:bg-slate-100 dark:hover:bg-slate-800 ${block.icon === emoji ? "bg-orange-50 ring-1 ring-orange-400 dark:bg-orange-950/40" : ""}`}>{emoji}</button>)}
          </div>
        </div>
      )}
      {view === "image" && (
        <div className="w-[230px]">
          <div className="mb-3 flex items-center gap-1.5">
            <button type="button" onClick={goBack} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back" aria-label="Back"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add Image ({block.attachedImages?.length ?? 0})</span>
          </div>
          {block.attachedImages && block.attachedImages.length > 0 && (
            <div className="mb-2.5 flex max-h-32 flex-col gap-1 overflow-y-auto">
              {block.attachedImages.map((image, index) => (
                <div key={`${image.url}-${index}`} className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-1 dark:bg-slate-800">
                  <NextImage src={image.url} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-800" />
                  <span className="min-w-0 flex-1 truncate text-[9.5px] text-slate-500 dark:text-slate-400">{image.url.startsWith("data:") ? "Base64" : image.alt || image.url}</span>
                  <button type="button" onClick={() => {
                    const next = block.attachedImages!.filter((_, imageIndex) => imageIndex !== index);
                    useWorkspaceStore.getState().updateBlock(block.id, { attachedImages: next.length > 0 ? next : undefined });
                  }} title="Remove" aria-label={`Remove image ${index + 1}`} className="shrink-0 p-0.5 text-red-500 hover:text-red-700">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="mb-2.5 flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            <Upload className="h-3.5 w-3.5 shrink-0 text-slate-400" />{isUploading ? "Uploading…" : "Select file from computer"}
          </button>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 dark:border-blue-900/30 dark:bg-blue-950/20">
              <kbd className="mt-0.5 shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Ctrl+V</kbd>
              <span className="text-[10.5px] leading-snug text-slate-600 dark:text-slate-400">Paste an image from clipboard into this node</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 dark:border-blue-900/30 dark:bg-blue-950/20">
              <LinkIcon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span className="text-[10.5px] leading-snug text-slate-600 dark:text-slate-400">Paste an image link (.png, .jpg…) to display it</span>
            </div>
          </div>
          <p className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[10.5px] leading-snug text-slate-600 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-slate-400">The image will be appended below this node.</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </div>
      )}
      {view === "link" && <BlockLinkEditor block={block} isOpen embedded onBack={goBack} onClose={onClose} />}
    </SwatchPopover>
  );
}

export default WorkspaceNodeContentPopover;
