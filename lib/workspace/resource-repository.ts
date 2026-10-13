/**
 * lib/workspace/resource-repository.ts
 *
 * CRUD + access control for WorkspaceResource / WorkspaceFileVersion
 * (prisma/schema.prisma, Checkpoint 5 of workspace-resource-roadmap.md).
 * Bytes live in ./resource-storage.ts; this module is Postgres metadata plus
 * the access boundary, same split as knowledge-repository.ts / storage.
 *
 * Access control is NOT re-derived here: requireBoardRead/requireBoardWrite
 * and WorkspaceAccessError are imported from ./knowledge-repository.ts, the
 * same board-access rules (case-insensitive identity match, 404-not-403 for
 * "no access") that file already established. Writing that logic a second
 * time is exactly the kind of duplication that broke once before (see the
 * comment on knowledge-repository.ts's own roleFor()).
 */

import { randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireBoardRead, requireBoardWrite, WorkspaceAccessError } from "./knowledge-repository";
import { putResourceObject, getResourceObject, deleteResourceObject } from "./resource-storage";
import {
  maybeCreatePdfPreviewArtifact,
  getPdfPreviewArtifactContent,
  type ArtifactSummary,
} from "./resource-artifact-repository";

export type WorkspaceResourceKindInput = "DOCUMENT" | "IMAGE";

export interface ResourceVersionSummary {
  id: string;
  versionNumber: number;
  sizeBytes: string; // BigInt serialized as string for JSON callers
  checksum: string;
  mimeType: string;
  createdByEmail: string;
  createdAt: Date;
  /** Null when this version's own mimeType previews directly (PDF/image) and
   *  needed no conversion, or when nothing has been attempted for it. */
  previewArtifact: ArtifactSummary | null;
}

export interface ResourceSummary {
  id: string;
  kind: WorkspaceResourceKindInput;
  filename: string;
  mimeType: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
  sourceDocumentId: string | null;
  latestVersion: ResourceVersionSummary;
}

const VERSION_SUMMARY_FIELDS = {
  id: true,
  versionNumber: true,
  sizeBytes: true,
  checksum: true,
  mimeType: true,
  createdByEmail: true,
  createdAt: true,
  artifacts: { where: { kind: "PDF_PREVIEW" as const }, select: { kind: true, status: true } },
} as const;

function toVersionSummary(version: {
  id: string;
  versionNumber: number;
  sizeBytes: bigint;
  checksum: string;
  mimeType: string;
  createdByEmail: string;
  createdAt: Date;
  artifacts?: { kind: "PDF_PREVIEW"; status: ArtifactSummary["status"] }[];
}): ResourceVersionSummary {
  const { artifacts, ...rest } = version;
  const artifact = artifacts?.[0];
  return {
    ...rest,
    sizeBytes: version.sizeBytes.toString(),
    previewArtifact: artifact ? { kind: artifact.kind, status: artifact.status } : null,
  };
}

/** Creates a resource and its first (and, for now, only) version in one call.
 *  Storage is written before the Postgres rows so a DB failure can be
 *  recovered from by deleting the now-orphaned object; the reverse order
 *  (DB row referencing bytes that might never arrive) would leave a resource
 *  with no content and no way to know that happened. This is a best-effort
 *  compensating action, not a two-phase commit — acceptable for a resource
 *  nothing else references yet (no file-reference block writes this table's
 *  foreign keys in this checkpoint). */
export async function createResource(
  boardId: string,
  callerEmail: string,
  input: {
    kind: WorkspaceResourceKindInput;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    sourceDocumentId?: string;
  },
): Promise<ResourceSummary> {
  await requireBoardWrite(boardId, callerEmail);

  const resourceId = randomUUID();
  const storageKey = `workspace-resources/${resourceId}/v1`;
  const checksum = createHash("sha256").update(input.buffer).digest("hex");

  await putResourceObject(storageKey, input.buffer, input.mimeType);

  try {
    const resource = await prisma.workspaceResource.create({
      data: {
        id: resourceId,
        boardId,
        kind: input.kind,
        filename: input.filename,
        mimeType: input.mimeType,
        createdByEmail: callerEmail,
        sourceDocumentId: input.sourceDocumentId ?? null,
        versions: {
          create: {
            versionNumber: 1,
            storageKey,
            sizeBytes: BigInt(input.buffer.byteLength),
            checksum,
            mimeType: input.mimeType,
            createdByEmail: callerEmail,
          },
        },
      },
      include: { versions: true },
    });

    // Best-effort and synchronous — see office-preview-conversion.ts's header
    // for why this runs inline rather than behind a job queue. Only Office
    // mimeTypes attempt anything; every other upload returns instantly, same
    // as before this existed.
    const previewArtifact = await maybeCreatePdfPreviewArtifact(
      resourceId,
      resource.versions[0].id,
      input.mimeType,
      input.buffer,
      input.filename,
    );

    return {
      id: resource.id,
      kind: resource.kind,
      filename: resource.filename,
      mimeType: resource.mimeType,
      createdByEmail: resource.createdByEmail,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      sourceDocumentId: resource.sourceDocumentId,
      latestVersion: { ...toVersionSummary(resource.versions[0]), previewArtifact },
    };
  } catch (err) {
    await deleteResourceObject(storageKey);
    throw err;
  }
}

export async function listResources(boardId: string, callerEmail: string): Promise<ResourceSummary[]> {
  await requireBoardRead(boardId, callerEmail);

  const resources = await prisma.workspaceResource.findMany({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: VERSION_SUMMARY_FIELDS,
      },
    },
  });

  // A resource always has >=1 version (created together in createResource),
  // so this filter only guards against a row from a future, not-yet-written
  // multi-version deletion path that leaves a version-less resource behind.
  return resources
    .filter((resource) => resource.versions.length > 0)
    .map((resource) => ({
      id: resource.id,
      kind: resource.kind,
      filename: resource.filename,
      mimeType: resource.mimeType,
      createdByEmail: resource.createdByEmail,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      sourceDocumentId: resource.sourceDocumentId,
      latestVersion: toVersionSummary(resource.versions[0]),
    }));
}

/** Read access, not write: a VIEWER who can see the board can download what
 *  it references, same bar as reading documents/comments. */
export async function getResourceContent(
  boardId: string,
  callerEmail: string,
  resourceId: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  await requireBoardRead(boardId, callerEmail);

  const resource = await prisma.workspaceResource.findFirst({
    where: { id: resourceId, boardId },
    select: {
      filename: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { storageKey: true, mimeType: true } },
    },
  });
  const latest = resource?.versions[0];
  if (!resource || !latest) return null;

  const buffer = await getResourceObject(latest.storageKey);
  if (!buffer) return null;

  return { buffer, mimeType: latest.mimeType, filename: resource.filename };
}

/** The `?variant=preview` counterpart to getResourceContent: the latest
 *  version's PDF_PREVIEW artifact bytes, when one exists and is READY.
 *  Read access, same bar as the original. */
export async function getResourceArtifactContent(
  boardId: string,
  callerEmail: string,
  resourceId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  await requireBoardRead(boardId, callerEmail);

  const resource = await prisma.workspaceResource.findFirst({
    where: { id: resourceId, boardId },
    select: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true } } },
  });
  const latest = resource?.versions[0];
  if (!latest) return null;

  const buffer = await getPdfPreviewArtifactContent(latest.id);
  if (!buffer) return null;
  return { buffer, mimeType: "application/pdf" };
}

/** Deletes the DB row (cascades versions + references + artifacts) before
 *  the storage objects: if storage deletion fails partway, no dangling DB
 *  row points at bytes that might still exist, just orphaned objects
 *  cleaned up later (by the sweep below). Shared by the access-checked
 *  single-resource delete and the unattended orphan sweep — no access
 *  check of its own, so every caller must have already authorized this. */
async function deleteResourceCascade(resourceId: string): Promise<void> {
  const resource = await prisma.workspaceResource.findUnique({
    where: { id: resourceId },
    select: { versions: { select: { storageKey: true, artifacts: { select: { storageKey: true } } } } },
  });
  if (!resource) return;

  await prisma.workspaceResource.delete({ where: { id: resourceId } });
  const objectKeys = resource.versions.flatMap((version) => [
    version.storageKey,
    ...version.artifacts.map((artifact) => artifact.storageKey).filter((key): key is string => Boolean(key)),
  ]);
  await Promise.all(objectKeys.map((key) => deleteResourceObject(key)));
}

/** Orphan GC (P5 retention, see resource-retention.ts): deletes every
 *  resource on this board older than `graceMs` that isn't in
 *  `referencedResourceIds`. Called only from the opportunistic sweep, never
 *  from a user-facing route. */
export async function pruneOrphanedResources(
  boardId: string,
  referencedResourceIds: ReadonlySet<string>,
  graceMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - graceMs);
  const candidates = await prisma.workspaceResource.findMany({
    where: { boardId, createdAt: { lt: cutoff } },
    select: { id: true },
  });
  const orphaned = candidates.filter((resource) => !referencedResourceIds.has(resource.id));
  for (const { id } of orphaned) {
    await deleteResourceCascade(id);
  }
  return orphaned.length;
}

export { WorkspaceAccessError };
