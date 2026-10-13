"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { flushWorkspacePendingSave } from "../../utils/workspacePersistenceFlush";

export function SlideExportMenu({ blockId }: { blockId: string }) {
  const [busy, setBusy] = useState(false);
  const download = async (format: "pptx" | "pdf") => {
    const boardId = useWorkspaceStore.getState().boardId;
    if (!boardId || busy) return;
    setBusy(true);
    try {
      if (!await flushWorkspacePendingSave(boardId)) throw new Error("Save has not completed. Retry when the workspace is connected.");
      if (useWorkspaceStore.getState().boardId !== boardId) return;
      const query = new URLSearchParams({ format, blockIds: JSON.stringify([blockId]) });
      const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/export?${query}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Export failed."); }
      const blob = await response.blob();
      if (useWorkspaceStore.getState().boardId !== boardId) return;
      const encodedName = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = encodedName ? decodeURIComponent(encodedName) : `Workspace.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  };
  return <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" disabled={busy} aria-label="Export PowerPoint" title="Download editable PowerPoint" className="rounded px-1.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-50" onClick={() => void download("pptx")}><Download className="inline h-3.5 w-3.5" /> {busy ? "Exporting…" : "PPTX"}</button>
    <button type="button" disabled={busy} aria-label="Export PDF" title="Download PDF" className="rounded px-1.5 py-1 text-xs hover:bg-slate-100 disabled:opacity-50" onClick={() => void download("pdf")}>PDF</button>
  </div>;
}
