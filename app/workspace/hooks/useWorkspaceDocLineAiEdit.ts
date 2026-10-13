"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useMessageStore } from "@/stores/useMessageStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { getSelectedAIModelName } from "@/lib/selected-ai-model";
import { runWorkspaceScopedAiEdit, workspaceEditToastMessage } from "./workspaceScopedAiEdit";

function findLineNode(editor: Editor, lineId: string): { pos: number; node: ProseMirrorNode } | null {
  let found: { pos: number; node: ProseMirrorNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.lineId === lineId) {
      found = { pos, node };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * "Improve with AI" for one line inside a doc/slideDeck block — a narrower
 * sibling of useWorkspaceAiNodeEdit.ts (that one rewrites/branches a whole
 * canvas block). Here the AI answer always replaces just the target node's
 * own text content, never adds sibling lines — there is no "list of
 * branches" concept at this granularity.
 */
export function useWorkspaceDocLineAiEdit(editor: Editor | null, blockId: string) {
  const [isRunning, setIsRunning] = useState(false);

  const runLineAiEdit = useCallback(async (lineId: string, request: string) => {
    const prompt = request.trim();
    if (!editor || !prompt || isRunning) return;
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) {
      toast.error("This board is read-only");
      return;
    }

    const target = findLineNode(editor, lineId);
    if (!target) return;
    const { node } = target;
    const currentText = node.textContent;
    const selectedModel = useMessageStore.getState().selectedModel;
    const modelIdentifier = selectedModel?.id || selectedModel?.name || getSelectedAIModelName();

    setIsRunning(true);
    try {
      const answer = await runWorkspaceScopedAiEdit({
        boardId: state.boardId,
        modelSelector: modelIdentifier,
        query: `Rewrite the selected document line according to this request: ${prompt}`,
        context: `Selected document blockId: ${blockId}. Selected lineId: ${lineId}. Current line text: ${currentText || "(empty)"}. Use update_rich_text with this exact blockId and lineId and mode "replace". Change this line only; preserve all other document content.`,
      });
      toast.message(workspaceEditToastMessage(answer));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error calling AI. Please try again.");
    } finally {
      setIsRunning(false);
    }
  }, [editor, isRunning]);

  return { isRunning, runLineAiEdit };
}

export default useWorkspaceDocLineAiEdit;
