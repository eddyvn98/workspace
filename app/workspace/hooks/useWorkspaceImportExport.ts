"use client";

import React, { useCallback, useRef } from "react";
import { useExport } from "./useExport";
import { useExportPdf } from "./useExportPdf";
import { useJsonBackup } from "./useJsonBackup";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { exportToOpmlWithStats, importFromOpml } from "../utils/opml";
import {
  exportSelectionToMarkdown,
  exportToMarkdown,
  importFromMarkdown,
} from "../utils/markdown";
import { buildWorkspaceImportAiPrompt } from "../utils/workspaceImportAi";

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useWorkspaceImportExport(
  onClose?: () => void,
  onImportMarkdownWithAI?: (prompt: string) => void
) {
  const { exportPng, exportSelectionPng, exportSvg } = useExport();
  const { exportPdf } = useExportPdf();
  const { exportJson, exportSelectionJson, importJson } = useJsonBackup();
  const selectedBlockIds = useWorkspaceStore((s) => s.selectedBlockIds);
  const isReadOnly = useWorkspaceStore((s) => s.isReadOnly);
  const hasSelection = selectedBlockIds.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const opmlFileInputRef = useRef<HTMLInputElement>(null);
  const markdownFileInputRef = useRef<HTMLInputElement>(null);
  const aiMarkdownFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportPng = useCallback(() => {
    exportPng(false);
    onClose?.();
  }, [exportPng, onClose]);

  const handleExportSelectionPng = useCallback(() => {
    exportSelectionPng();
    onClose?.();
  }, [exportSelectionPng, onClose]);

  const handleExportSvg = useCallback(() => {
    exportSvg(false);
    onClose?.();
  }, [exportSvg, onClose]);

  const handleExportPdf = useCallback(() => {
    exportPdf();
    onClose?.();
  }, [exportPdf, onClose]);

  const handleExportMarkdown = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const state = useWorkspaceStore.getState();
    const md = exportToMarkdown(state.blocks, state.blockOrder, state.title, state.connectors);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeTitle = (state.title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");

    triggerDownload(url, `${safeTitle}.md`);
    URL.revokeObjectURL(url);
    onClose?.();
  }, [onClose]);

  const handleExportSelectionMarkdown = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const state = useWorkspaceStore.getState();
    if (state.selectedBlockIds.length === 0) return;

    const md = exportSelectionToMarkdown(
      state.blocks,
      state.selectedBlockIds,
      state.blockOrder,
      state.title,
      state.connectors
    );
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeTitle = (state.title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");

    triggerDownload(url, `${safeTitle}-selection.md`);
    URL.revokeObjectURL(url);
    onClose?.();
  }, [onClose]);

  const handleExportJson = useCallback(() => {
    exportJson();
    onClose?.();
  }, [exportJson, onClose]);

  const handleExportSelectionJson = useCallback(() => {
    exportSelectionJson();
    onClose?.();
  }, [exportSelectionJson, onClose]);

  const handleImportJsonClick = useCallback(() => {
    fileInputRef.current?.click();
    onClose?.();
  }, [onClose]);

  const handleJsonFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = "";
    },
    [importJson]
  );

  const handleExportOpml = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const state = useWorkspaceStore.getState();
    const { opml, exportedCount, skippedCount } = exportToOpmlWithStats(state.blocks, state.title);

    if (exportedCount === 0) {
      window.alert(
        "No tree-structured blocks found to export. Free-floating blocks without parent/child relationships cannot be exported to OPML."
      );
      onClose?.();
      return;
    }

    const blob = new Blob([opml], { type: "text/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeTitle = (state.title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");

    triggerDownload(url, `${safeTitle}.opml`);
    URL.revokeObjectURL(url);

    if (skippedCount > 0) {
      window.alert(
        `Exported ${exportedCount} tree block${exportedCount === 1 ? "" : "s"} to OPML. Skipped ${skippedCount} free-floating block${skippedCount === 1 ? "" : "s"} (not part of a tree).`
      );
    }

    onClose?.();
  }, [onClose]);

  const handleImportOpmlClick = useCallback(() => {
    opmlFileInputRef.current?.click();
    onClose?.();
  }, [onClose]);

  const handleOpmlFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text !== "string") return;

        try {
          const { blocks, connectors, skippedCount } = importFromOpml(text);
          if (blocks.length === 0) {
            window.alert("No outlines found in that OPML file.");
            return;
          }

          const state = useWorkspaceStore.getState();
          for (const block of blocks) {
            state.addBlock(block);
          }
          for (const connector of connectors) {
            state.addConnector(connector);
          }

          if (skippedCount > 0) {
            window.alert(
              `Imported ${blocks.length} block${blocks.length === 1 ? "" : "s"}. Skipped ${skippedCount} non-outline element${skippedCount === 1 ? "" : "s"}.`
            );
          }
        } catch {
          window.alert("Couldn't read that file as an OPML outline (invalid XML).");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const handleImportMarkdownClick = useCallback(() => {
    markdownFileInputRef.current?.click();
    onClose?.();
  }, [onClose]);

  const handleImportMarkdownWithAIClick = useCallback(() => {
    aiMarkdownFileInputRef.current?.click();
    onClose?.();
  }, [onClose]);

  const handleMarkdownWithAIFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !onImportMarkdownWithAI) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string" && text.trim()) {
          onImportMarkdownWithAI(buildWorkspaceImportAiPrompt(text, file.name));
        }
      };
      reader.readAsText(file);
    },
    [onImportMarkdownWithAI]
  );

  const handleMarkdownFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text !== "string") return;

        try {
          const { blocks, connectors, skippedCount } = importFromMarkdown(text);
          if (blocks.length === 0) {
            window.alert("No outlines or blocks found in that Markdown file.");
            return;
          }

          const state = useWorkspaceStore.getState();
          for (const block of blocks) {
            state.addBlock(block);
          }
          for (const connector of connectors) {
            state.addConnector(connector);
          }

          if (skippedCount > 0) {
            window.alert(
              `Imported ${blocks.length} block${blocks.length === 1 ? "" : "s"}. Skipped ${skippedCount} element${skippedCount === 1 ? "" : "s"}.`
            );
          }
        } catch {
          window.alert("Couldn't read that file as Markdown.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  return {
    hasSelection,
    isReadOnly,
    fileInputRef,
    opmlFileInputRef,
    markdownFileInputRef,
    aiMarkdownFileInputRef,
    handleExportPng,
    handleExportSelectionPng,
    handleExportSvg,
    handleExportPdf,
    handleExportMarkdown,
    handleExportSelectionMarkdown,
    handleExportJson,
    handleExportSelectionJson,
    handleExportOpml,
    handleImportJsonClick,
    handleJsonFileSelected,
    handleImportOpmlClick,
    handleOpmlFileSelected,
    handleImportMarkdownClick,
    handleMarkdownFileSelected,
    handleImportMarkdownWithAIClick,
    handleMarkdownWithAIFileSelected,
  };
}
