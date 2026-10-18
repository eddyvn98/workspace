"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/features/auth/protected-route";
import type { CollectionAppSummary } from "@/app/workspace/collections/collectionAppListing";

export default function CollectionsClient({ devBypass }: { devBypass: boolean }) {
  const [items, setItems] = useState<CollectionAppSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/collections", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load collections (" + response.status + ")");
        const result = await response.json() as CollectionAppSummary[];
        if (active) { setItems(result); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Collection request failed");
      } finally { if (active) setLoading(false); }
    };
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return <ProtectedRoute devBypass={devBypass}>
    <main className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">Workspace apps</p><h1 className="text-3xl font-semibold">Collections</h1><p className="mt-2 text-sm text-slate-500">The same records and views, accessible outside the canvas.</p></div>
          <Link href="/workspace" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-white dark:border-slate-700">Open Workspace</Link>
        </div>
        {loading && <p role="status">Loading collections...</p>}
        {error && <p role="alert" className="rounded-lg border border-red-300 p-4 text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center"><h2 className="font-semibold">No collections yet</h2><p className="mt-2 text-sm text-slate-500">Add a Collection block in Workspace to make it available here.</p></div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => <Link key={item.boardId + "/" + item.blockId} href={"/collections/" + encodeURIComponent(item.boardId) + "/" + encodeURIComponent(item.blockId)} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{item.boardTitle}</p><h2 className="mt-2 truncate text-lg font-semibold group-hover:text-blue-600">{item.title}</h2>
            <p className="mt-4 text-sm text-slate-500">{item.recordCount} records · {item.viewCount} views</p>
            <p className="mt-3 text-xs text-slate-400">Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
          </Link>)}
        </div>
      </div>
    </main>
  </ProtectedRoute>;
}
