import WorkspaceClientPage from "./WorkspaceClientPage";

/** The auth bypass decision must match server HTML and client hydration. */
export default function Workspace() {
  const devBypass = process.env.NODE_ENV !== "production" && Boolean(process.env.WORKSPACE_DEV_USER_EMAIL);
  return <WorkspaceClientPage devBypass={devBypass} />;
}
