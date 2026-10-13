"use client";

import { Suspense } from "react";
import ProtectedRoute from "@/components/features/auth/protected-route";
import WorkspacePage from "@/app/workspace/components/WorkspacePage";
import { useToolLayoutSlots } from "@/hooks/use-tool-layout-slots";
import { WorkspaceBoardSidebar } from "@/app/workspace/components/WorkspaceBoardSidebar";
import { WorkspaceLegacyMigrationGate } from "@/app/workspace/components/WorkspaceLegacyMigrationGate";
import { WorkspacePerfDebug } from "@/app/workspace/components/WorkspacePerfDebug";

export default function WorkspaceClientPage({ devBypass }: { devBypass: boolean }) {
  useToolLayoutSlots({ showHistory: false, aside: <WorkspaceBoardSidebar />, hideTopAsideToggle: true });

  return (
    <ProtectedRoute devBypass={devBypass}>
      <Suspense fallback={null}>
        <WorkspaceLegacyMigrationGate>
          <WorkspacePerfDebug />
          <WorkspacePage />
        </WorkspaceLegacyMigrationGate>
      </Suspense>
    </ProtectedRoute>
  );
}
