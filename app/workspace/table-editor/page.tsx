"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { useWorkspacePersistence } from "@/app/workspace/hooks/useWorkspacePersistence";
import { useWorkspaceRealtime } from "@/app/workspace/hooks/useWorkspaceRealtime";
import { useWorkspaceExternalSync } from "@/app/workspace/hooks/useWorkspaceExternalSync";
import { useBoardViewerRole } from "@/app/workspace/hooks/useBoardViewerRole";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { WorkspaceBlockAiPanel } from "@/app/workspace/components/WorkspaceBlockAiPanel";

const WorkspaceSpreadsheetEditor = dynamic(
  () => import("@/app/workspace/components/table/WorkspaceSpreadsheetEditor"),
  { ssr: false },
);

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

function TableEditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = searchParams.get("boardId") ?? "";
  const tableId = searchParams.get("tableId") ?? "";
  const { isLoadingBoard, loadError, isBoardReady, isSavePending } = useWorkspacePersistence(boardId);
  const realtime = useWorkspaceRealtime(boardId, isBoardReady && !loadError);
  useWorkspaceExternalSync(boardId, { live: realtime.live, hasUnsavedLocalChanges: isSavePending });
  useBoardViewerRole(boardId);
  const block = useWorkspaceStore((state) => {
    const candidate = state.blocks[tableId];
    return candidate?.type === "table" ? candidate as CanvasBlock<"table"> : null;
  });
  const title = useWorkspaceStore((state) => state.title);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const goBack = React.useCallback(() => {
    router.push(boardId ? `/workspace?id=${encodeURIComponent(boardId)}` : "/workspace");
  }, [boardId, router]);
  const handleChange = React.useCallback((patch: Partial<TableBlockPayload>) => {
    if (!block || isReadOnly) return;
    updateBlock(tableId, { data: { ...block.data, ...patch } });
  }, [block, isReadOnly, tableId, updateBlock]);

  if (!boardId || !tableId) return <EditorStatus message="This spreadsheet link is incomplete." onBack={goBack} />;
  if (loadError && !block) return <EditorStatus message="This workspace could not be loaded." onBack={goBack} />;
  if (isLoadingBoard || !block) return <EditorStatus message="Loading spreadsheet…" onBack={goBack} />;

  return (
    <WorkspaceSpreadsheetEditor
      block={block}
      onChange={handleChange}
      onClose={goBack}
      standalone
      boardTitle={title}
      allowEdit={!isReadOnly}
      assistant={<WorkspaceBlockAiPanel key={`${boardId}:${tableId}`} boardId={boardId} blockId={tableId} blockType="table" />}
    />
  );
}

export default function WorkspaceTableEditorPage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={<EditorStatus message="Loading spreadsheet…" onBack={() => undefined} />}>
        <TableEditorPageContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
