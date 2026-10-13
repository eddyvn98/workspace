"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { DEFAULT_CAMERA } from "../types/camera";
import { workspacePerfLog } from "../utils/workspacePerfDebug";

const BACKUP_VERSION = 1;

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Whole-board and selection-scoped JSON backup — a portable file the user can save
 * and later re-import, independent of the localStorage autosave draft.
 */
export function useJsonBackup() {
  const exportJson = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const state = useWorkspaceStore.getState();
    const payload = {
      version: BACKUP_VERSION,
      title: state.title,
      blocks: state.blocks,
      blockOrder: state.blockOrder,
      connectors: state.connectors,
      camera: state.camera,
      exportedAt: Date.now(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const safeTitle = (state.title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");
    triggerDownload(url, `${safeTitle}.json`);
    URL.revokeObjectURL(url);
  }, []);

  const exportSelectionJson = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const state = useWorkspaceStore.getState();
    const { selectedBlockIds, blocks, blockOrder, connectors, camera, title } = state;
    if (selectedBlockIds.length === 0) return;

    const selectedSet = new Set(selectedBlockIds);
    const selectedBlocks: Record<string, typeof blocks[string]> = {};
    for (const id of selectedBlockIds) {
      if (blocks[id]) selectedBlocks[id] = blocks[id];
    }
    const selectedBlockOrder = blockOrder.filter((id) => selectedSet.has(id));
    const selectedConnectors: Record<string, typeof connectors[string]> = {};
    for (const [id, c] of Object.entries(connectors)) {
      if (selectedSet.has(c.fromBlockId) && selectedSet.has(c.toBlockId)) {
        selectedConnectors[id] = c;
      }
    }

    const payload = {
      version: BACKUP_VERSION,
      title: `${title || "workspace"} (Selection)`,
      blocks: selectedBlocks,
      blockOrder: selectedBlockOrder,
      connectors: selectedConnectors,
      camera,
      exportedAt: Date.now(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const safeTitle = (title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");
    triggerDownload(url, `${safeTitle}-selection.json`);
    URL.revokeObjectURL(url);
  }, []);

  const importJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") return;

      try {
        const parsed = JSON.parse(text) as {
          title?: unknown;
          blocks?: unknown;
          blockOrder?: unknown;
          connectors?: unknown;
          camera?: unknown;
        };

        const importedBlocks = parsed.blocks && typeof parsed.blocks === "object" ? Object.keys(parsed.blocks).length : 0;
        const importedConnectors = parsed.connectors && typeof parsed.connectors === "object" ? Object.keys(parsed.connectors).length : 0;
        workspacePerfLog("json-import", {
          fileName: file.name,
          bytes: file.size,
          blocks: importedBlocks,
          blockOrder: Array.isArray(parsed.blockOrder) ? parsed.blockOrder.length : 0,
          connectors: importedConnectors,
        });

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof parsed.blocks !== "object" ||
          !Array.isArray(parsed.blockOrder)
        ) {
          window.alert("This file doesn't look like a workspace backup.");
          return;
        }

        useWorkspaceStore.setState({
          blocks: (parsed.blocks as ReturnType<typeof useWorkspaceStore.getState>["blocks"]) ?? {},
          blockOrder: parsed.blockOrder as string[],
          connectors:
            (parsed.connectors as ReturnType<typeof useWorkspaceStore.getState>["connectors"]) ??
            {},
          camera: (parsed.camera as typeof DEFAULT_CAMERA) ?? DEFAULT_CAMERA,
          title: typeof parsed.title === "string" && parsed.title !== "Untitled Workspace"
            ? parsed.title
            : "Untitled",
          selectedBlockIds: [],
          selectedConnectorId: null,
        });
      } catch {
        window.alert("Couldn't read that file as a workspace backup (invalid JSON).");
      }
    };
    reader.readAsText(file);
  }, []);

  return { exportJson, exportSelectionJson, importJson };
}

export default useJsonBackup;
