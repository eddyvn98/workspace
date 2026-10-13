"use client";

export function WorkspaceLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 backdrop-blur-[1px] dark:bg-[#0f1117]/70"
      data-workspace-loading="true"
    >
      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-lg dark:bg-slate-900 dark:text-slate-300">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        Loading mindmap…
      </div>
    </div>
  );
}

export default WorkspaceLoadingOverlay;
