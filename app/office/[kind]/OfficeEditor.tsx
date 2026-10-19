"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
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
import { officeFileAccess, officeKindOfBlock, type OfficeKind } from "@/lib/office/catalog";
import { fetchRemoteBoard } from "@/app/workspace/hooks/workspaceBoardApi";
import { createEmbeddedWorkspaceTable, insertWorkspaceTableReference } from "@/app/workspace/utils/workspaceDocTableEmbedding";
import type { WorkspaceDocTableEmbedHandler, WorkspaceDocTableInsertHandler } from "@/app/workspace/utils/workspaceDocEditorHelpers";
import { flushWorkspacePendingSave } from "@/app/workspace/utils/workspacePersistenceFlush";
import { toast } from "sonner";

const Spreadsheet = dynamic(() => import("@/app/workspace/components/table/WorkspaceSpreadsheetEditor"), { ssr: false });

function Status({ text }: { text: string }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-4 p-5"><p role="status">{text}</p><Link href="/office" className="text-blue-600 underline">Back to Office</Link></div>;
}

function Content({ kind, viewer }: { kind: OfficeKind; viewer: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const boardId = params.get("boardId") ?? "";
  const blockId = params.get("blockId") ?? "";
  const [hasEditorDraft, setHasEditorDraft] = useState(false);
  const { isBoardReady, isLoadingBoard, loadError, isSavePending, saveError } = useWorkspacePersistence(boardId);
  const realtime = useWorkspaceRealtime(boardId, isBoardReady && !loadError);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasEditorDraft || isSavePending || saveError) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasEditorDraft, isSavePending, saveError]);
  useWorkspaceExternalSync(boardId, { live: realtime.live, hasUnsavedLocalChanges: isSavePending || Boolean(saveError) || hasEditorDraft });
  useBoardViewerRole(boardId);
  const storeBoardId = useWorkspaceStore(s => s.boardId);
  const block = useWorkspaceStore(s => s.blocks[blockId]);
  const boardTitle = useWorkspaceStore(s => s.title);
  const storeReadOnly = useWorkspaceStore(s => s.isReadOnly);
  const readOnly = viewer || storeReadOnly;
  const editor = useWorkspaceStore(s => s.activeRichTextEditor);
  const updateBlock = useWorkspaceStore(s => s.updateBlock);
  const addBlock = useWorkspaceStore(s => s.addBlock);
  const title = block?.officeTitle || (block?.type === "slideDeck" ? (block.data as { title?: string }).title : undefined) || boardTitle;
  const [draftTitle, setDraftTitle] = useState(title);
  useEffect(() => { setDraftTitle(title); }, [title, boardId, blockId]);
  const renameFile = useCallback(() => {
    const next = draftTitle.trim();
    if (readOnly || !next || next.length > 120 || next === title) { setDraftTitle(title); return; }
    const state = useWorkspaceStore.getState();
    const current = state.blocks[blockId];
    if (!current || state.boardId !== boardId) return;
    if (current.type === "slideDeck") state.updateBlock(blockId, { officeTitle: next, data: { ...current.data, title: next } });
    else state.updateBlock(blockId, { officeTitle: next });
    if (state.blockOrder.length === 1 && state.title === title) state.setTitle(next);
  }, [blockId, boardId, draftTitle, title, readOnly]);
  const insertTable = useCallback<WorkspaceDocTableInsertHandler>((mode, editor, range) => {
    if (readOnly) return;
    const table = createEmbeddedWorkspaceTable(blockId, mode);
    addBlock(table);
    insertWorkspaceTableReference(editor, range, table.id);
  }, [addBlock, blockId, readOnly]);
  const embedTable = useCallback<WorkspaceDocTableEmbedHandler>((tableId, editor, range) => {
    if (readOnly) return;
    const current = useWorkspaceStore.getState().blocks[tableId];
    if (!current || current.type !== "table" || current.embeddedInDocId) return;
    updateBlock(tableId, { embeddedInDocId: blockId });
    insertWorkspaceTableReference(editor, range, tableId);
  }, [blockId, readOnly, updateBlock]);
  const saveAndNavigate = useCallback(async (url: string) => {
    const ok = await flushWorkspacePendingSave(boardId);
    if (!ok) { toast.error("Changes have not been saved on the server."); return; }
    router.push(url);
  }, [boardId, router]);
  const saveAndLeave = useCallback(() => saveAndNavigate("/office"), [saveAndNavigate]);

  if (!boardId || !blockId) return <Status text="Missing document link." />;
  if (loadError) return <Status text="Workspace file unavailable or access denied." />;
  if (!isBoardReady || isLoadingBoard || storeBoardId !== boardId) return <Status text="Loading Office file..." />;
  if (!block || officeKindOfBlock(block) !== kind) return <Status text="This file no longer exists in Workspace." />;

  const changeData = (data: CanvasBlock["data"]) => {
    if (!readOnly && useWorkspaceStore.getState().boardId === boardId) updateBlock(blockId, { data });
  };
  return <main className="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => void saveAndLeave()} className="text-sm text-indigo-600 hover:underline">← Office</button>
        <input aria-label="Office file name" title="Rename Office file" value={draftTitle} onChange={e => setDraftTitle(e.target.value)}
          onBlur={renameFile} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          readOnly={readOnly} maxLength={120}
          className="w-36 max-w-[35vw] rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-indigo-500 sm:w-72" />
        <span className="text-xs text-slate-500">{readOnly ? "View only" : saveError ? "Save failed" : hasEditorDraft ? "Editing cell..." : isSavePending ? "Saving..." : "Saved"}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button type="button" disabled={readOnly} onClick={() => void flushWorkspacePendingSave(boardId).then(ok => ok ? toast.success("Saved") : toast.error("Save not confirmed"))} className="rounded border px-3 py-1.5 disabled:opacity-50">Save</button>
        <button type="button" onClick={() => void saveAndNavigate(`/workspace?id=${encodeURIComponent(boardId)}`)} className="text-indigo-600 hover:underline">Open on canvas</button>
      </div>
    </header>
    {saveError && <p role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">{saveError} Keep this tab open and retry Save, or export a Native backup.</p>}
    {kind === "document" && block.type === "doc" && <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-10 shrink-0 border-b bg-white px-4 dark:bg-slate-900">
        {!readOnly && editor?.blockId === blockId && <WorkspaceDocFormatToolbar commands={editor.commands} marks={editor.activeMarks} hideExpand />}
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-5"><div className="mx-auto min-h-full max-w-3xl bg-white shadow-sm dark:bg-slate-900">
          <WorkspaceDocRichEditor blockId={blockId} html={(block as CanvasBlock<"doc">).data.html || ""} isEditing={!readOnly}
            onChange={html => changeData({ html })} onStopEditing={() => {}}
            onInsertTable={insertTable} onEmbedTable={embedTable} />
        </div></div>
        <WorkspaceBlockAiPanel boardId={boardId} blockId={blockId} blockType="doc" forceReadOnly={readOnly} />
      </div>
    </div>}
    {kind === "spreadsheet" && block.type === "table" && <div className="min-h-0 flex-1">
      <Spreadsheet block={block as CanvasBlock<"table">} standalone fillParent hideHeader allowEdit={!readOnly} boardTitle={title} boardId={boardId} onDirtyChange={setHasEditorDraft}
        onClose={() => void saveAndLeave()}
        onChange={(patch: Partial<TableBlockPayload>) => {
          const latest = useWorkspaceStore.getState().blocks[blockId];
          if (latest?.type === "table" && !readOnly) changeData({ ...latest.data, ...patch });
        }}
        assistant={<WorkspaceBlockAiPanel boardId={boardId} blockId={blockId} blockType="table" forceReadOnly={readOnly} />} />
    </div>}
    {kind === "presentation" && block.type === "slideDeck" && <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto h-full min-h-96 max-w-7xl overflow-hidden rounded-xl bg-white shadow-md">
        <SlideDeckBlock block={block as CanvasBlock<"slideDeck">} isSelected readOnly={readOnly} onChange={patch => {
          const latest = useWorkspaceStore.getState().blocks[blockId];
          if (latest?.type === "slideDeck" && !readOnly) changeData({ ...latest.data, ...patch });
        }} />
      </div>
    </div>}
  </main>;
}
/** Fail closed until a server read confirms this exact block and the viewer role. */
function AuthorizedEditor({ kind }: { kind: OfficeKind }) {
  const params = useSearchParams();
  const boardId = params.get("boardId") ?? "";
  const blockId = params.get("blockId") ?? "";
  const key = JSON.stringify([kind, boardId, blockId]);
  const [access, setAccess] = useState<{ key: string; viewer: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAccess(null);
    setError("");
    if (!boardId || !blockId) {
      setError("Missing Office file link.");
      return () => { active = false; };
    }
    void fetchRemoteBoard(boardId).then((board) => {
      if (!active) return;
      const permission = officeFileAccess(board, kind, blockId);
      if (!permission.authorized) {
        setError("Office file unavailable or access denied.");
        return;
      }
      setAccess({ key, viewer: permission.viewer });
    }).catch(() => { if (active) setError("Office access check failed."); });
    return () => { active = false; };
  }, [boardId, blockId, kind, key]);
  if (error) return <Status text={error} />;
  if (!access || access.key !== key) return <Status text="Checking Office permissions..." />;
  return <Content key={key} kind={kind} viewer={access.viewer} />;
}

export default function OfficeEditor({ kind, devBypass }: { kind: OfficeKind; devBypass: boolean }) {
  return <ProtectedRoute devBypass={devBypass}><Suspense fallback={<Status text="Loading Office..." />}><AuthorizedEditor kind={kind} /></Suspense></ProtectedRoute>;
}
