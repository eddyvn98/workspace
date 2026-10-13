"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, Link as LinkIcon } from "lucide-react";
import type { CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { normalizeBlockLink } from "../utils/link";

export interface BlockLinkEditorProps {
  block: CanvasBlock;
  isOpen?: boolean;
  onClose: () => void;
  onBack?: () => void;
  embedded?: boolean;
}

export const BlockLinkEditor: React.FC<BlockLinkEditorProps> = ({
  block,
  isOpen = true,
  onClose,
  onBack,
  embedded = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);

  const [url, setUrl] = useState(block.link ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(block.link ?? "");
      setError(null);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, block.link]);

  useEffect(() => {
    if (!isOpen || embedded) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [embedded, isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      updateBlock(block.id, { link: undefined });
      onClose();
      return;
    }

    const normalized = normalizeBlockLink(trimmed);
    if (!normalized) {
      setError("Invalid URL format");
      return;
    }

    updateBlock(block.id, { link: normalized });
    onClose();
  };

  const handleRemove = () => {
    updateBlock(block.id, { link: undefined });
    onClose();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (onBack) {
        onBack();
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Edit node link"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={!embedded ? { position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60 } : undefined}
      className={embedded ? "w-[260px]" : "flex min-w-[280px] max-w-[360px] flex-col gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack ?? onClose}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Node link
        </span>
        {block.link && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[10px] text-rose-500 hover:text-rose-700"
          >
            Remove
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="https://example.com"
          className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-blue-400"
        />
        <button
          type="button"
          onClick={handleSave}
          title="Apply link"
          className="rounded bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Apply
        </button>
      </div>
      {error && (
        <span className="mt-1 block text-[10px] font-medium text-rose-500 dark:text-rose-400">
          {error}
        </span>
      )}
      <p className="mt-2 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
        Paste link here, then click node title to open.
      </p>
    </div>
  );
};

export default BlockLinkEditor;
