"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMessageStore } from "@/stores/useMessageStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { getSelectedAIModelName } from "@/lib/selected-ai-model";
import { runWorkspaceScopedAiEdit, workspaceEditToastMessage } from "./workspaceScopedAiEdit";

/**
 * "Edit / Expand with AI" for one block — the toolbar's sparkle button.
 *
 * Same contract as legacy's useAiNodeEdit (app/mindmap/hooks/useAiNodeEdit.ts):
 * the model is asked for a Markdown bullet list, and the shape of the answer
 * decides the action. A bullet list becomes new child branches; a single bare
 * line rewrites the block's own text. Before this existed the sparkle button
 * called setPendingEditBlockId, which merely opened the inline text editor —
 * so a button labelled "Edit / Expand with AI" never reached any AI.
 */

function blockText(data: unknown): string {
  const record = data as { markdown?: unknown; label?: unknown; title?: unknown } | undefined;
  for (const value of [record?.markdown, record?.label, record?.title]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function useWorkspaceAiNodeEdit() {
  const [isRunning, setIsRunning] = useState(false);

  const runAiNodeEdit = useCallback(async (blockId: string, request: string) => {
    const prompt = request.trim();
    if (!prompt || isRunning) return;
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) {
      toast.error("This board is read-only");
      return;
    }
    const block = state.blocks[blockId];
    if (!block) return;
    const selectedModel = useMessageStore.getState().selectedModel;
    const modelIdentifier = selectedModel?.id || selectedModel?.name || getSelectedAIModelName();

    setIsRunning(true);
    try {
      const answer = await runWorkspaceScopedAiEdit({
        boardId: state.boardId,
        modelSelector: modelIdentifier,
        query: `Apply this request to the selected Workspace branch: ${prompt}`,
        context: `Selected blockId: ${blockId}. Current topic: ${blockText(block.data) || "Untitled"}. Add requested sub-branches as child blocks. If the request directly edits the selected branch, update that block only. Do not mutate unrelated blocks.`,
      });
      toast.message(workspaceEditToastMessage(answer));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error calling AI. Please try again.");
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  return { isRunning, runAiNodeEdit };
}
