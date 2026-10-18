"use client";
import { Workflow, FileText, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function ToolSwitcher() {
  const pathname = usePathname();
  return <nav className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-xs dark:bg-slate-800/60" aria-label="Workspace applications">
    {[
      { href: "/workspace", label: "Workspace", Icon: Workflow },
      { href: "/office", label: "Office", Icon: FileText },
      { href: "/collections", label: "Collections", Icon: LayoutGrid },
    ].map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}
      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 ${pathname.startsWith(href) ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700" : "text-slate-600 dark:text-slate-300"}`}>
      <Icon className="h-4 w-4" />{label}</Link>)}
  </nav>;
}
