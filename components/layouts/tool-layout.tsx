"use client";

import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToolLayoutStore } from "@/stores/useToolLayoutStore";
import { ToolSwitcher } from "@/components/layouts/tool-switcher";
import { HeaderUserMenu } from "@/components/layouts/header-user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface ToolLayoutProps {
  children: ReactNode;
  aside?: ReactNode;
  showHistory?: boolean;
  breadcrumb?: ReactNode;
  headerActions?: ReactNode;
}

export default function ToolLayout({
  children,
  aside: asideProp,
  breadcrumb: breadcrumbProp,
  headerActions: headerActionsProp,
}: ToolLayoutProps) {
  const slots = useToolLayoutStore();
  const isMobile = useIsMobile();
  const aside = asideProp ?? slots.aside;
  const collapsed = slots.mindmapAsideCollapsed;
  const setCollapsed = slots.setMindmapAsideCollapsed;
  const width = slots.mindmapAsideWidth;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950">
        {aside && !slots.hideTopAsideToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={collapsed ? "Expand workspace sidebar" : "Collapse workspace sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
        <div className="min-w-0 flex-1">{breadcrumbProp ?? <ToolSwitcher />}</div>
        <div className="flex shrink-0 items-center gap-2">{headerActionsProp}<HeaderUserMenu /></div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {aside && !collapsed && !isMobile && (
          <aside style={{ width }} className="shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800">
            {aside}
          </aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</main>
      </div>
      {aside && isMobile && (
        <Sheet open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
          <SheetContent side="left" className="flex h-dvh w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden p-0" aria-describedby={undefined}>
            <div className="border-b p-4"><SheetTitle>Workspace</SheetTitle></div>
            <div className="min-h-0 flex-1 overflow-y-auto">{aside}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
