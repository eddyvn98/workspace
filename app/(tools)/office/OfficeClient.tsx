"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, FileText, LayoutGrid, Presentation, Search, Sheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ProtectedRoute from "@/components/features/auth/protected-route";
import { useToolLayoutSlots } from "@/hooks/use-tool-layout-slots";
import { officeEditorUrl, OFFICE_KINDS, type OfficeFileSummary, type OfficeKind } from "@/lib/office/catalog";

const apps = {
  document: { label: "Documents", singular: "Document", icon: FileText, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40", name: "Untitled Document" },
  spreadsheet: { label: "Spreadsheets", singular: "Spreadsheet", icon: Sheet, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", name: "Untitled Spreadsheet" },
  presentation: { label: "Presentations", singular: "Presentation", icon: Presentation, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/40", name: "Untitled Presentation" },
} as const;

export default function OfficeClient({ devBypass }: { devBypass: boolean }) {
  useToolLayoutSlots({ aside: null, hideTopAsideToggle: true });
  const router = useRouter();
  const [files, setFiles] = useState<OfficeFileSummary[]>([]);
  const [filter, setFilter] = useState<OfficeKind | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<OfficeKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/office", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load Office files (${response.status})`);
      const result: unknown = await response.json();
      if (!Array.isArray(result)) throw new Error("Malformed Office list");
      setFiles(result as OfficeFileSummary[]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cannot load Office files");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const createFile = async (kind: OfficeKind) => {
    if (creating) return;
    setCreating(kind);
    try {
      const response = await fetch("/api/office", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title: apps[kind].name }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Unable to create file");
      router.push(result.url);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to create file");
    } finally { setCreating(null); }
  };

  const visibleFiles = useMemo(() => files
    .filter((file) => (filter === "all" || file.kind === filter) &&
      (file.title + " " + file.boardTitle).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [files, filter, query]);

  return <ProtectedRoute devBypass={devBypass}>
    <main className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-600">Workspace apps</p>
            <h1 className="text-3xl font-semibold">Office</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">Edit documents, spreadsheets and presentations. All files share their original Workspace data.</p>
          </div>
          <Link href="/workspace" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
            <LayoutGrid className="h-4 w-4" /> Open Workspace
          </Link>
        </header>
        <section aria-label="Office apps" className="mb-8 grid gap-4 md:grid-cols-3">
          {OFFICE_KINDS.map((kind) => {
            const app = apps[kind];
            const Icon = app.icon;
            return <div key={kind} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${app.bg} ${app.color}`}><Icon className="h-6 w-6" /></div>
              <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{app.label}</h2><span className="text-xs text-slate-400">{files.filter((f) => f.kind === kind).length} files</span></div>
              <p className="mt-1 text-sm text-slate-500">Edit and sync with Workspace.</p>
              <button type="button" onClick={() => void createFile(kind)} disabled={creating !== null}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
                <FilePlus2 className="h-4 w-4" />{creating === kind ? "Creating…" : `New ${app.singular}`}
              </button>
            </div>;
          })}
        </section>
        <section aria-label="Office files" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
            <div><h2 className="text-lg font-semibold">All files</h2><p className="text-xs text-slate-500">Your files and Office blocks on shared Workspace boards</p></div>
            <button type="button" aria-label="Refresh Office files" onClick={() => void load()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <label className="relative min-w-48 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input aria-label="Search Office files" placeholder="Search files or boards" value={query} onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700" /></label>
            <select aria-label="Filter Office app" value={filter} onChange={(e) => setFilter(e.target.value as OfficeKind | "all")}
              className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
              <option value="all">All apps</option>{OFFICE_KINDS.map((kind) => <option key={kind} value={kind}>{apps[kind].label}</option>)}
            </select>
          </div>
          {loading && <p role="status" className="p-8 text-center text-sm text-slate-500">Loading Office files…</p>}
          {error && <p role="alert" className="m-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button></p>}
          {!loading && !error && visibleFiles.length === 0 && <div className="p-12 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="font-medium">{files.length ? "No matching files" : "No Office files yet"}</p>
            <p className="mt-2 text-sm text-slate-500">Create a new file above or add a Document, Table or Slide Deck in Workspace.</p>
          </div>}
          {!error && visibleFiles.map((file) => {
            const app = apps[file.kind];
            const Icon = app.icon;
            return <div key={file.boardId + "/" + file.blockId} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${app.bg} ${app.color}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><Link href={officeEditorUrl(file.kind, file.boardId, file.blockId)} className="block truncate text-sm font-semibold hover:text-indigo-600 hover:underline">{file.title}</Link>
                <p className="mt-0.5 truncate text-xs text-slate-500">{app.singular} · {file.boardTitle} · {file.viewerRole === "VIEWER" ? "View only" : "Can edit"}</p></div>
              <span className="hidden text-xs text-slate-400 sm:block">{new Date(file.updatedAt).toLocaleDateString()}</span>
              <Link href={`/workspace?id=${encodeURIComponent(file.boardId)}`} className="text-xs font-medium text-indigo-600 hover:underline">Canvas</Link>
            </div>;
          })}
        </section>
      </div>
    </main>
  </ProtectedRoute>;
}
