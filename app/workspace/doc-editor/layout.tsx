import type { ReactNode } from "react";
import ProtectedRoute from "@/components/features/auth/protected-route";

export default function WorkspaceDocEditorLayout({ children }: { children: ReactNode }) {
	return <ProtectedRoute>{children}</ProtectedRoute>;
}
