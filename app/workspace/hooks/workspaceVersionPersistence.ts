import type { WorkspaceSnapshotSummary } from "./workspaceVersionApi";

export interface WorkspaceVersionSnapshotCheck {
  request: string;
  userEmail: string | null;
  before: WorkspaceSnapshotSummary[] | null;
}

const VERSION_WRITE_REQUEST = /\b(?:create|save|add)\b[^\n]{0,48}\b(?:version|snapshot|checkpoint)\b|\b(?:version|snapshot|checkpoint)\b[^\n]{0,48}\b(?:create|save|add)\b|(?:tạo|lưu|thêm)\s+(?:một\s+)?(?:phiên bản|bản chụp|điểm khôi phục)/iu; // vi-allow
const EXPLICIT_LABEL = /\b(?:labeled|labelled|named|label)\s+["“']([^"”']+)["”']|(?:nhãn|tên)\s+["“']([^"”']+)["”']/iu; // vi-allow
const NEGATED_VERSION_WRITE = /\b(?:no|without|never|don't|do not)\b[^\n]{0,36}\b(?:create|save|add)\b|\b(?:don't|do not)\b[^\n]{0,24}\b(?:version|snapshot|checkpoint)\b|không\s+(?:tạo|lưu|thêm)\s+(?:một\s+)?(?:phiên bản|bản chụp|điểm khôi phục)/iu; // vi-allow

export function isVersionSnapshotRequest(request: string): boolean {
  return !NEGATED_VERSION_WRITE.test(request) && VERSION_WRITE_REQUEST.test(request);
}

export async function fetchWorkspaceSnapshots(
  boardId: string,
): Promise<WorkspaceSnapshotSummary[] | null> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/versions`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? payload as WorkspaceSnapshotSummary[] : null;
  } catch {
    return null;
  }
}

export async function beginWorkspaceVersionSnapshotCheck(
  boardId: string,
  request: string,
  userEmail: string | null,
): Promise<WorkspaceVersionSnapshotCheck | null> {
  if (!isVersionSnapshotRequest(request)) return null;
  return { request, userEmail, before: await fetchWorkspaceSnapshots(boardId) };
}

export async function verifyWorkspaceVersionSnapshot(
  boardId: string,
  check: WorkspaceVersionSnapshotCheck | null,
): Promise<WorkspaceSnapshotSummary | null> {
  if (!check) return null;
  const after = await fetchWorkspaceSnapshots(boardId);
  return findPersistedVersionSnapshot(check.before, after, check.userEmail, check.request);
}

export function findPersistedVersionSnapshot(
  before: WorkspaceSnapshotSummary[] | null,
  after: WorkspaceSnapshotSummary[] | null,
  userEmail: string | null,
  request: string,
): WorkspaceSnapshotSummary | null {
  if (!before || !after) return null;
  const beforeIds = new Set(before.map((snapshot) => snapshot.id));
  const expectedLabel = request.match(EXPLICIT_LABEL)?.slice(1).find(Boolean)?.trim();
  if (!userEmail && !expectedLabel) return null;

  return after.find((snapshot) =>
    !beforeIds.has(snapshot.id) &&
    (!userEmail || snapshot.createdBy.toLowerCase() === userEmail.toLowerCase()) &&
    (!expectedLabel || snapshot.label?.trim() === expectedLabel)
  ) ?? null;
}

export function versionSnapshotAppliedSummary(
  snapshot: WorkspaceSnapshotSummary,
  request: string,
): string {
  const label = snapshot.label ? ` “${snapshot.label}”` : "";
  return /(?:tạo|lưu|thêm|phiên bản|bản chụp|điểm khôi phục)/iu.test(request) // vi-allow
    ? `Đã lưu phiên bản${label}.` // vi-allow
    : `Saved a new version${label}.`;
}
