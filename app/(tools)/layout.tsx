import type React from "react";
import ToolLayout from "@/components/layouts/tool-layout";

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return <ToolLayout>{children}</ToolLayout>;
}
