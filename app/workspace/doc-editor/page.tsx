"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { useWorkspacePersistence } from "@/app/workspace/hooks/useWorkspacePersistence";
import { useBoardViewerRole } from "@/app/workspace/hooks/useBoardViewerRole";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { WorkspaceDocRichEditor } from "@/app/workspace/renderers/WorkspaceDocRichEditor";
import { WorkspaceDocFormatToolbar } from "@/app/workspace/components/WorkspaceDocFormatToolbar";
import { WorkspaceBlockAiPanel } from "@/app/workspace/components/WorkspaceBlockAiPanel";
import { createEmbeddedWorkspaceTable, insertWorkspaceTableReference } from "@/app/workspace/utils/workspaceDocTableEmbedding";
import type { WorkspaceDocTableEmbedHandler, WorkspaceDocTableInsertHandler } from "@/app/workspace/utils/workspaceDocEditorHelpers";

function EditorStatus({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <button type="button" onClick={onBack} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          Back to workspace
        </button>
      </div>
    </main>
  );
}

/**
 * Standalone full-screen doc-block editor, opened in a new tab via
 * WorkspaceDocFormatToolbar's "Open in new tab" button
 * (utils/workspaceDocEditorEvents.ts) — the same "deep-edit away from the
 * canvas" pattern table-editor/page.tsx already established for spreadsheet
 * tables. Reuses WorkspaceDocRichEditor as-is (always `isEditing`, no canvas
 * zoom ancestor to worry about) so every doc feature — the per-line ⋮ menu,
 * inline images, formatting — works identically here.
 */
function DocEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = searchParams.get("boardId") ?? "";
  const docId = searchParams.get("docId") ?? "";
  const { isLoadingBoard, loadError } = useWorkspacePersistence(boardId);
  useBoardViewerRole(boardId);
  const block = useWorkspaceStore((state) => {
    const candidate = state.blocks[docId];
    return candidate?.type === "doc" ? (candidate as CanvasBlock<"doc">) : null;
  });
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const activeRichTextEditor = useWorkspaceStore((state) => state.activeRichTextEditor);
  const goBack = React.useCallback(() => {
    router.push(boardId ? `/workspace?id=${encodeURIComponent(boardId)}` : "/workspace");
  }, [boardId, router]);
  const handleChange = React.useCallback((html: string) => {
    if (isReadOnly) return;
    updateBlock(docId, { data: { html } });
  }, [isReadOnly, docId, updateBlock]);
  const onInsertTable = React.useCallback<WorkspaceDocTableInsertHandler>((mode, editor, range) => {
    if (isReadOnly) return;
    const table = createEmbeddedWorkspaceTable(docId, mode);
    addBlock(table);
    insertWorkspaceTableReference(editor, range, table.id);
  }, [addBlock, docId, isReadOnly]);
  const onEmbedTable = React.useCallback<WorkspaceDocTableEmbedHandler>((tableId, editor, range) => {
    if (isReadOnly) return;
    const candidate = useWorkspaceStore.getState().blocks[tableId];
    if (!candidate || candidate.type !== "table" || candidate.embeddedInDocId) return;
    updateBlock(tableId, { embeddedInDocId: docId });
    insertWorkspaceTableReference(editor, range, tableId);
  }, [docId, isReadOnly, updateBlock]);

  if (!boardId || !docId) return <EditorStatus message="This document link is incomplete." onBack={goBack} />;
  if (loadError && !block) return <EditorStatus message="This workspace could not be loaded." onBack={goBack} />;
  if (isLoadingBoard || !block) return <EditorStatus message="Loading document…" onBack={goBack} />;

  const isThisDocActive = activeRichTextEditor?.blockId === docId;
  const commands = isThisDocActive ? activeRichTextEditor!.commands : null;
  const marks = isThisDocActive ? activeRichTextEditor!.activeMarks : null;

  return (
    <main className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </button>
        <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
        {commands && marks && (
          <div className="flex flex-wrap items-center gap-1">
            <WorkspaceDocFormatToolbar commands={commands} marks={marks} hideExpand />
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="mx-auto h-full max-w-3xl">
            <WorkspaceDocRichEditor blockId={docId} html={block.data?.html ?? ""} isEditing={!isReadOnly} onChange={handleChange} onStopEditing={goBack} onInsertTable={onInsertTable} onEmbedTable={onEmbedTable} />
          </div>
        </div>
        <WorkspaceBlockAiPanel key={`${boardId}:${docId}`} boardId={boardId} blockId={docId} blockType="doc" />
      </div>
    </main>
  );
}

export default function WorkspaceDocEditorPage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={<EditorStatus message="Loading document…" onBack={() => undefined} />}>
        <DocEditorPageContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
