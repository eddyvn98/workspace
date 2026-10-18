"use client";

import { Workflow } from "lucide-react";
import Link from "next/link";

export function ToolSwitcher() {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
      <Workflow className="h-3.5 w-3.5 shrink-0 text-violet-600" />
      <span>Workspace</span>
      <Link href="/collections" className="ml-3 border-l border-slate-300 pl-3 text-blue-600 hover:underline dark:border-slate-600" >Collections</Link>
    </div>
  );
}
