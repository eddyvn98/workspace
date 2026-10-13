/**
 * Files a chat attachment under the board it was attached from, so a later
 * message can search it instead of it being read once and forgotten.
 *
 * A function rather than three lines inside the upload hook, so the behaviour
 * that actually matters here — that a failure is swallowed — is testable
 * without rendering a component.
 *
 * Legacy oracle: the side-upload in app/mindmap/hooks/useChatFileUpload.ts.
 */

/**
 * Never throws and never reports. The caller has already shown the user their
 * attachment as uploaded, and it IS uploaded — this is the board remembering
 * it as well. An unsaved board or an unsupported file type must not turn a
 * working attachment red, so the failure is deliberately invisible.
 *
 * @returns true when the board accepted the file, for callers that care.
 */
export async function fileAttachmentUnderBoard(
  boardId: string | null | undefined,
  file: File,
): Promise<boolean> {
  if (!boardId) {
    console.warn("[workspace chat] knowledge indexing skipped because no board id was available");
    return false;
  }
  const result = await uploadWorkspaceDocumentUnderBoard(boardId, file);
  if (!result.indexed) console.warn("[workspace chat] uploaded file was not added to the board knowledge index");
  return result.indexed;
}

export interface WorkspaceUploadedResource {
  id: string;
  kind: "DOCUMENT" | "IMAGE";
  filename: string;
  mimeType: string;
  latestVersion: {
    sizeBytes: string;
    previewArtifact: { status: "PENDING" | "READY" | "FAILED" | "UNSUPPORTED" } | null;
  };
}

/** Uploads once to the board knowledge endpoint and returns the canonical
 * resource created alongside extracted text, when original-byte storage succeeds. */
export async function uploadWorkspaceDocumentUnderBoard(
  boardId: string | null | undefined,
  file: File,
): Promise<{ resource: WorkspaceUploadedResource | null; indexed: boolean }> {
  if (!boardId) return { resource: null, indexed: false };
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/documents`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) return { resource: null, indexed: false };
    const data = await response.json() as { resource?: WorkspaceUploadedResource | null; skipped?: boolean; document?: unknown };
    return { resource: data.resource ?? null, indexed: !data.skipped && Boolean(data.document) };
  } catch {
    return { resource: null, indexed: false };
  }
}
