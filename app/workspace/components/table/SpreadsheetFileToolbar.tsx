"use client";
import { useEffect, useRef, useState } from "react";
import type { CanvasBlock } from "../../types/block";
import type { TableBlockPayload } from "../../types/table";
import type { WorkbookImport } from "@/lib/office/spreadsheet/xlsx";
import { getTableWorkbookSheets } from "../../utils/workspaceTableWorkbook";
import { importedPayload, replacementPatch } from "@/lib/office/spreadsheet/payload";
import { SHEET_LIMITS } from "@/lib/office/spreadsheet/limits";
import { runWorkbookTask } from "@/lib/office/spreadsheet/workerClient";
import { writeCsv } from "@/lib/office/spreadsheet/csv";
import { writeNativeBackup } from "@/lib/office/spreadsheet/nativeBackup";
import { tableDataSignature } from "./workspaceSpreadsheetEditorUtils";
import { Root as Dialog, Portal, Overlay, Content as DialogContent, Description as DialogDescription, Title as DialogTitle } from "@radix-ui/react-dialog";

interface Props {
  getBlock: () => CanvasBlock<"table">;
  flush: () => Promise<boolean>;
  onChange: (patch: Partial<TableBlockPayload>) => void;
  allowEdit: boolean;
  title: string;
}
function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export function SpreadsheetFileToolbar({ getBlock, flush, onChange, allowEdit, title }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ value: WorkbookImport; signature: string } | null>(null);
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const permission = useRef(allowEdit); permission.current = allowEdit;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!allowEdit) { controller.current?.abort(); setPending(null); } }, [allowEdit]);
  const filename = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 100) || "Spreadsheet";
  const operation = async (run: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(""); setNotice("");
    try { if (!await flush()) throw new Error("Finish the active cell edit before continuing."); await run(abort.signal); }
    catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Spreadsheet file operation failed."); }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
  };
  const importFile = (file: File) => operation(async (signal) => {
    if (!permission.current) return;
    if (file.size > SHEET_LIMITS.fileBytes) throw new Error("File exceeds 10 MiB.");
    const format = file.name.toLowerCase().endsWith(".workspace.json") ? "native" : file.name.toLowerCase().split(".").pop();
    if (format !== "xlsx" && format !== "csv" && format !== "tsv" && format !== "native") throw new Error("Choose an XLSX, UTF-8 CSV, TSV or .workspace.json backup.");
    const signature = tableDataSignature(getBlock().data);
    const result = await runWorkbookTask({ type: "import", bytes: new Uint8Array(await file.arrayBuffer()), format }, signal);
    if (result.type === "import" && permission.current && !signal.aborted) setPending({ value: result.value, signature });
  });
  const exportFile = (format: "xlsx" | "csv" | "json") => operation(async (signal) => {
    const block = getBlock();
    if (format === "json") {
      download(writeNativeBackup(block, title), filename + ".workspace.json", "application/json");
      setNotice("Native backup saved. Restore it using Import file in this editor."); return;
    }
    if (format === "csv") {
      download(writeCsv(block.data), filename + ".csv", "text/csv;charset=utf-8");
      setNotice("CSV contains active-sheet display values only. Formula-like text is neutralized for safe opening."); return;
    }
    const result = await runWorkbookTask({ type: "export", sheets: getTableWorkbookSheets(block), activeSheetId: block.data.activeSheetId ?? block.id }, signal);
    if (result.type !== "export" || signal.aborted) return;
    if (result.warnings.length && !window.confirm("Export compatibility notes:\n\n" + result.warnings.join("\n") + "\n\nContinue exporting?")) return;
    download(result.bytes.slice().buffer, filename + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setNotice("XLSX exported. Excel recalculates formulas on opening.");
  });
  const confirmImport = async () => {
    if (!pending || !permission.current || !await flush()) return;
    if (tableDataSignature(getBlock().data) !== pending.signature) {
      setError("The workbook changed while the file was being processed. Import cancelled to protect newer edits."); setPending(null); return;
    }
    onChange(replacementPatch(getBlock().data, importedPayload(pending.value))); setPending(null);
    setNotice("Workbook replaced. Check the save status before leaving this page.");
  };
  const button = "rounded border px-2 py-1 text-xs disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800";
  return <div className="shrink-0 border-b bg-white px-3 py-2 dark:bg-slate-900" aria-label="Spreadsheet files">
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={!allowEdit || busy} onClick={() => input.current?.click()}>Import file</button>
      <button className={button} disabled={busy} onClick={() => void exportFile("xlsx")}>Export XLSX</button>
      <button className={button} disabled={busy} onClick={() => void exportFile("csv")}>Export CSV</button>
      <button className={button} disabled={busy} onClick={() => void exportFile("json")}>Native backup</button>
      {busy && <><span role="status" className="text-xs">Processing file...</span><button className={button} onClick={() => controller.current?.abort()}>Cancel operation</button></>}
      <span className="text-xs text-slate-500">Up to 20 sheets / 50,000 cells / 10 MiB</span>
    </div>
    <input ref={input} aria-label="Import spreadsheet file" type="file" accept=".xlsx,.csv,.tsv,.json" hidden onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file);
    }} />
    {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    {notice && <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">{notice}</p>}
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <Portal><Overlay className="fixed inset-0 z-[150] bg-black/50" />
      <DialogContent className="fixed left-1/2 top-1/2 z-[151] flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-xl border bg-white p-6 shadow-xl dark:bg-slate-900">
        <DialogTitle>Replace this workbook?</DialogTitle>
        <DialogDescription>All current sheets will be replaced. Cancel and export a Native backup first to keep an exact copy. Imported backups keep this Office file identity.</DialogDescription>
        <p className="text-sm">{pending?.value.sheets.length} sheets: {pending?.value.sheets.map((s) => s.name).join(", ")}</p>
        <div className="space-y-2 text-sm">{pending?.value.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
        <div className="flex justify-end gap-2"><button className={button} onClick={() => setPending(null)}>Cancel import</button>
          <button className={button} disabled={!allowEdit} onClick={() => void confirmImport()}>Replace workbook</button></div>
      </DialogContent></Portal>
    </Dialog>
  </div>;
}
