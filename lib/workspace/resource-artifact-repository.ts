/**
 * lib/workspace/resource-artifact-repository.ts
 *
 * WorkspaceArtifact CRUD — split out of resource-repository.ts at the
 * 300-line cap, same reason knowledge-repository.ts split search into its
 * own file. No access control here: every function takes an already-
 * resolved versionId, and the caller (resource-repository.ts) is the one
 * that checked board access.
 */

import { prisma } from "@/lib/prisma";
import { putResourceObject, getResourceObject } from "./resource-storage";
import {
  isOfficeDocumentMimeType,
  isOfficeConverterAvailable,
  convertOfficeDocumentToPdf,
} from "./office-preview-conversion";

export interface ArtifactSummary {
  kind: "PDF_PREVIEW";
  status: "PENDING" | "READY" | "FAILED" | "UNSUPPORTED";
}

/** Best-effort, synchronous, in-request — see office-preview-conversion.ts's
 *  header for why there is no job queue yet. Never throws: a conversion
 *  failure must not fail the resource upload it is attached to. Returns the
 *  resulting summary so the caller can hand it straight back to the client
 *  without a second query. */
export async function maybeCreatePdfPreviewArtifact(
  resourceId: string,
  versionId: string,
  mimeType: string,
  buffer: Buffer,
  filename: string,
): Promise<ArtifactSummary | null> {
  if (!isOfficeDocumentMimeType(mimeType)) return null;

  try {
    if (!(await isOfficeConverterAvailable())) {
      await prisma.workspaceArtifact.create({
        data: { versionId, kind: "PDF_PREVIEW", status: "UNSUPPORTED" },
      });
      return { kind: "PDF_PREVIEW", status: "UNSUPPORTED" };
    }

    const result = await convertOfficeDocumentToPdf(buffer, filename);
    if (result.status !== "READY") {
      await prisma.workspaceArtifact.create({
        data: {
          versionId,
          kind: "PDF_PREVIEW",
          status: result.status,
          error: result.status === "FAILED" ? result.error : null,
        },
      });
      return { kind: "PDF_PREVIEW", status: result.status };
    }

    const storageKey = `workspace-resources/${resourceId}/artifacts/${versionId}-preview.pdf`;
    await putResourceObject(storageKey, result.pdf, "application/pdf");
    await prisma.workspaceArtifact.create({
      data: { versionId, kind: "PDF_PREVIEW", status: "READY", storageKey, mimeType: "application/pdf" },
    });
    return { kind: "PDF_PREVIEW", status: "READY" };
  } catch (err) {
    console.warn("[workspace artifact] failed to record conversion result:", err);
    return null;
  }
}

export async function getPdfPreviewArtifactSummary(versionId: string): Promise<ArtifactSummary | null> {
  const artifact = await prisma.workspaceArtifact.findUnique({
    where: { versionId_kind: { versionId, kind: "PDF_PREVIEW" } },
    select: { kind: true, status: true },
  });
  return artifact ?? null;
}

/** Read access is the caller's responsibility (see resource-repository.ts) —
 *  this only resolves READY bytes or null for every other status. */
export async function getPdfPreviewArtifactContent(versionId: string): Promise<Buffer | null> {
  const artifact = await prisma.workspaceArtifact.findUnique({
    where: { versionId_kind: { versionId, kind: "PDF_PREVIEW" } },
    select: { status: true, storageKey: true },
  });
  if (!artifact || artifact.status !== "READY" || !artifact.storageKey) return null;
  return getResourceObject(artifact.storageKey);
}
