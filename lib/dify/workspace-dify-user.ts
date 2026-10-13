/** Stable Dify end-user identity shared by Workspace file uploads and chats. */
export function buildWorkspaceDifyUserId(workspaceId: string, email: string): string {
  return `wa:${workspaceId.trim()}:${email.trim().toLowerCase()}`;
}
