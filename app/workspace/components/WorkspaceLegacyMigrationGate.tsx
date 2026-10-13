"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function WorkspaceLegacyMigrationGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyMindmapId = searchParams.get("legacyMindmapId");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!legacyMindmapId) return;
    let cancelled = false;
    void fetch(`/api/mindmaps/${encodeURIComponent(legacyMindmapId)}/migrate-to-workspace`, { method: "POST" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Migration failed");
        if (!cancelled && typeof body.boardId === "string") router.replace(`/workspace?id=${encodeURIComponent(body.boardId)}`);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Migration failed");
      });
    return () => { cancelled = true; };
  }, [legacyMindmapId, router]);

  if (!legacyMindmapId) return children;
  if (error) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-red-600">{error}</main>;
  }
  return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-500">Moving this map to Workspace…</main>;
}
