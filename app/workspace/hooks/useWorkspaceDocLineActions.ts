"use client";

import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createDocLineOperations, type DocLineTurnIntoKind } from "../utils/docLineOperations";
import { docLineLink, findDocLine } from "../utils/docLineTargets";

export type { DocLineTurnIntoKind } from "../utils/docLineOperations";

export function useWorkspaceDocLineActions(editor: Editor | null, blockId: string) {
  const operations = editor ? createDocLineOperations(editor) : null;
  const canEdit = () => editor && !editor.isDestroyed && editor.isEditable && !useWorkspaceStore.getState().isReadOnly;
  const copyLink = async (lineId: string) => {
    if (typeof window === "undefined" || !editor || editor.isDestroyed) return;
    const target = findDocLine(editor.state.doc, lineId);
    const url = docLineLink(window.location.href, useWorkspaceStore.getState().boardId, blockId, target?.node.attrs.lineId || lineId);
    if (!url) { toast.error("Save this document before copying its link"); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link to this line copied");
    } catch {
      toast.error("Could not copy link");
    }
  };
  return {
    turnInto: (id: string, kind: DocLineTurnIntoKind) => { if (canEdit()) operations?.turnInto(id, kind); },
    duplicate: (id: string) => { if (canEdit()) operations?.duplicate(id); },
    moveUp: (id: string) => { if (canEdit()) operations?.moveUp(id); },
    moveDown: (id: string) => { if (canEdit()) operations?.moveDown(id); },
    remove: (id: string) => { if (canEdit()) operations?.remove(id); },
    copyLink,
  };
}

export default useWorkspaceDocLineActions;
