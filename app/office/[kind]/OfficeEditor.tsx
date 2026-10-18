"use client";
import { Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { useWorkspacePersistence } from "@/app/workspace/hooks/useWorkspacePersistence";
import { useWorkspaceRealtime } from "@/app/workspace/hooks/useWorkspaceRealtime";
import { useWorkspaceExternalSync } from "@/app/workspace/hooks/useWorkspaceExternalSync";
import { useBoardViewerRole } from "@/app/workspace/hooks/useBoardViewerRole";
import { WorkspaceDocRichEditor } from "@/app/workspace/renderers/WorkspaceDocRichEditor";
import { WorkspaceDocFormatToolbar } from "@/app/workspace/components/WorkspaceDocFormatToolbar";
import { WorkspaceBlockAiPanel } from "@/app/workspace/components/WorkspaceBlockAiPanel";
import { SlideDeckBlock } from "@/app/workspace/renderers/SlideDeckBlock";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { officeKindOfBlock, type OfficeKind } from "@/lib/office/catalog";
import { flushWorkspacePendingSave } from "@/app/workspace/utils/workspacePersistenceFlush";
import { toast } from "sonner";

const Spreadsheet = dynamic(() => import("@/app/workspace/components/table/WorkspaceSpreadsheetEditor"), { ssr: false });

function Status({ text }: { text: string }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-4 p-5"><p role="status">{text}</p><Link href="/office" className="text-blue-600 underline">Back to Office</Link></div>;
}

function Content({ kind }: { kind: OfficeKind }) {
  const params = useSearchParams();
  const router = useRouter();
  const boardId = params.get("boardId") ?? "";
  const blockId = params.get("blockId") ?? "";
  const { isBoardReady, isLoadingBoard, loadError, isSavePending, saveError } = useWorkspacePersistence(boardId);
  const realtime = useWorkspaceRealtime(boardId, isBoardReady && !loadError);
  useWorkspaceExternalSync(boardId, { live: realtime.live, hasUnsavedLocalChanges: isSavePending });
  useBoardViewerRole(boardId);
  const storeBoardId = useWorkspaceStore(s => s.boardId);
  const block = useWorkspaceStore(s => s.blocks[blockId]);
  const boardTitle = useWorkspaceStore(s => s.title);
  const readOnly = useWorkspaceStore(s => s.isReadOnly);
  const editor = useWorkspaceStore(s => s.activeRichTextEditor);
  const updateBlock = useWorkspaceStore(s => s.updateBlock);
  const saveAndLeave = useCallback(async () => {
    const ok = await flushWorkspacePendingSave(boardId);
    if (!ok) { toast.error("Changes have not been saved on the server."); return; }
    router.push("/office");
  }, [boardId, router]);

  if (!boardId || !blockId) return <Status text="Missing document link." />;
  if (loadError) return <Status text="Workspace file unavailable or access denied." />;
  if (!isBoardReady || isLoadingBoard || storeBoardId !== boardId) return <Status text="Loading Office file..." />;
  if (!block || officeKindOfBlock(block) !== kind) return <Status text="This file no longer exists in Workspace." />;

  const title = block.officeTitle || (block.type === "slideDeck" ? (block.data as { title?: string }).title : undefined) || boardTitle;
  const changeData = (data: CanvasBlock["data"]) => {
    if (!readOnly) updateBlock(blockId, { data });
  };
  return <main className="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => void saveAndLeave()} className="text-sm text-indigo-600 hover:underline">← Office</button>
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-slate-500">{readOnly ? "View only" : isSavePending ? "Saving..." : saveError ? "Save failed" : "Autosave"}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button type="button" disabled={readOnly} onClick={() => void flushWorkspacePendingSave(boardId).then(ok => ok ? toast.success("Saved") : toast.error("Save not confirmed"))} className="rounded border px-3 py-1.5 disabled:opacity-50">Save</button>
        <Link href={`/workspace?id=${encodeURIComponent(boardId)}`} className="text-indigo-600 hover:underline">Open on canvas</Link>
      </div>
    </header>
    {kind === "document" && block.type === "doc" && <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-10 shrink-0 border-b bg-white px-4 dark:bg-slate-900">
        {!readOnly && editor?.blockId === blockId && <WorkspaceDocFormatToolbar commands={editor.commands} marks={editor.activeMarks} hideExpand />}
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-5"><div className="mx-auto min-h-full max-w-3xl bg-white shadow-sm dark:bg-slate-900">
          <WorkspaceDocRichEditor blockId={blockId} html={block.data.html || ""} isEditing={!readOnly}
            onChange={html => changeData({ html })} onStopEditing={() => {}} />
        </div></div>
        <WorkspaceBlockAiPanel boardId={boardId} blockId={blockId} blockType="doc" />
      </div>
    </div>}
    {kind === "spreadsheet" && block.type === "table" && <div className="min-h-0 flex-1">
      <Spreadsheet block={block} standalone fillParent hideHeader allowEdit={!readOnly} boardTitle={title}
        onClose={() => void saveAndLeave()}
        onChange={(patch: Partial<TableBlockPayload>) => {
          const latest = useWorkspaceStore.getState().blocks[blockId];
          if (latest?.type === "table" && !readOnly) changeData({ ...latest.data, ...patch });
        }}
        assistant={<WorkspaceBlockAiPanel boardId={boardId} blockId={blockId} blockType="table" />} />
    </div>}
    {kind === "presentation" && block.type === "slideDeck" && <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto h-full min-h-96 max-w-7xl overflow-hidden rounded-xl bg-white shadow-md">
        <SlideDeckBlock block={block} isSelected readOnly={readOnly} onChange={patch => {
          const latest = useWorkspaceStore.getState().blocks[blockId];
          if (latest?.type === "slideDeck" && !readOnly) changeData({ ...latest.data, ...patch });
        }} />
      </div>
    </div>}
  </main>;
}
export default function OfficeEditor({ kind, devBypass }: { kind: OfficeKind; devBypass: boolean }) {
  return <ProtectedRoute devBypass={devBypass}><Suspense fallback={<Status text="Loading Office..." />}><Content kind={kind} /></Suspense></ProtectedRoute>;
}
