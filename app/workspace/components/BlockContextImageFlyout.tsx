"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, Upload, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import { uploadOrReadWorkspaceImage } from "../utils/imageUpload";

export function BlockContextImageFlyout({ block, onBack, onClose }: { block: CanvasBlock; onBack: () => void; onClose: () => void }) {
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadOrReadWorkspaceImage(file);
      if (!url) return;
      updateBlock(block.id, { attachedImages: [...(block.attachedImages ?? []), { url, alt: file.name }] });
      onClose();
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const next = (block.attachedImages ?? []).filter((_, imageIndex) => imageIndex !== index);
    updateBlock(block.id, { attachedImages: next.length > 0 ? next : undefined });
  };

  return (
    <div className="absolute left-full top-0 ml-1.5 w-[236px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center gap-1.5"><button type="button" onClick={onBack} title="Back"><ChevronLeft className="h-3.5 w-3.5 text-slate-400" /></button><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add Image</span></div>
      {block.attachedImages && block.attachedImages.length > 0 && (
        <div className="mb-2 max-h-32 space-y-1 overflow-y-auto">
          {block.attachedImages.map((image, index) => (
            <div key={`${image.url}-${index}`} className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-1 dark:bg-slate-800">
              <Image src={image.url} alt={image.alt || ""} width={24} height={24} unoptimized className="h-6 w-6 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-[9.5px] text-slate-500 dark:text-slate-400">{image.alt || image.url}</span>
              <button type="button" onClick={() => removeImage(index)} title="Remove" aria-label={`Remove image ${index + 1}`} className="shrink-0 p-0.5 text-red-500 hover:text-red-700"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
        <Upload className="h-3.5 w-3.5 text-slate-400" />{isUploading ? "Uploading…" : "Select file from computer"}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[10.5px] leading-snug text-slate-600 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-slate-400">The image will be appended below this node.</p>
    </div>
  );
}

export default BlockContextImageFlyout;
