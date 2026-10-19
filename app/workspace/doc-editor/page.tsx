import Link from "next/link";
import { redirect } from "next/navigation";

/** Preserve existing document bookmarks while using Office's shared save/access/realtime lifecycle. */
export default function WorkspaceDocEditorPage({ searchParams }: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const boardId = typeof searchParams.boardId === "string" ? searchParams.boardId : "";
  const docId = typeof searchParams.docId === "string" ? searchParams.docId : "";
  if (boardId && docId) {
    const params = new URLSearchParams({ boardId, blockId: docId });
    if (typeof searchParams.focusLine === "string") params.set("focusLine", searchParams.focusLine);
    redirect(`/office/document?${params.toString()}`);
  }
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 dark:bg-slate-950">
    <p role="status" className="text-sm text-slate-600 dark:text-slate-300">This document link is incomplete.</p>
    <Link href="/office" className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Back to Office</Link>
  </main>;
}
