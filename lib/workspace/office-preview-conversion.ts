/**
 * lib/workspace/office-preview-conversion.ts
 *
 * Converts an Office document (docx/xlsx/pptx and their legacy .doc/.xls/.ppt
 * counterparts) to PDF via a locally-installed LibreOffice, so it can preview
 * through the exact same PDF iframe path as a native application/pdf upload
 * (renderers/FileBlock.tsx) instead of a second, parallel preview mechanism.
 *
 * No new service/container here: this shells out to `soffice --headless`
 * synchronously, inside the resource-upload request, the same "best-effort,
 * inline, non-fatal to the upload" shape already used for image captioning
 * in app/api/workspaces/[id]/documents/route.ts. There is no job/worker
 * queue in this codebase yet (see workspace-resource-roadmap.md's P1 "jobs"
 * gap) — introducing one just for this would be solving a problem this
 * feature doesn't have yet at typical Office-file conversion times (a few
 * seconds). If conversions become slow or frequent enough to matter, move
 * this behind a real queue then, not preemptively now.
 *
 * If LibreOffice isn't installed (checked once, cached), conversion is
 * reported UNSUPPORTED rather than attempted-and-failed — the roadmap's own
 * requirement that "unsupported phải báo rõ" (unsupported must be surfaced
 * clearly, not silently retried).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const OFFICE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]);

export function isOfficeDocumentMimeType(mimeType: string): boolean {
  return OFFICE_MIME_TYPES.has(mimeType);
}

let cachedBinary: string | null | undefined;

async function resolveSofficeBinary(): Promise<string | null> {
  if (cachedBinary !== undefined) return cachedBinary;

  const candidates = [
    process.env.SOFFICE_PATH,
    "soffice",
    "soffice.exe",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      cachedBinary = candidate;
      return cachedBinary;
    } catch {
      continue;
    }
  }
  cachedBinary = null;
  return null;
}

/** Exposed for the repository layer to decide PENDING/UNSUPPORTED before
 *  even attempting a conversion, and for tests. */
export async function isOfficeConverterAvailable(): Promise<boolean> {
  return (await resolveSofficeBinary()) !== null;
}

export type ConversionResult =
  | { status: "READY"; pdf: Buffer }
  | { status: "UNSUPPORTED" }
  | { status: "FAILED"; error: string };

/** A converted PDF larger than this is refused rather than buffered whole
 *  into memory — a decompression-bomb-style crafted input (e.g. an OOXML
 *  relationship file that expands massively) could otherwise turn a small
 *  upload into an oversized in-memory read with no limit. */
const MAX_CONVERTED_PDF_BYTES = 50 * 1024 * 1024;

/** Disables macro execution in the isolated profile this conversion runs
 *  under (see UserInstallation below) — an untrusted uploaded .doc/.docx/etc
 *  is exactly the kind of input LibreOffice macro-based exploits target, and
 *  --headless alone does not guarantee macros are skipped. MacroSecurityLevel
 *  3 = disable all macros without notification (no interactive prompt is
 *  possible headless anyway). */
const MACRO_LOCKDOWN_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
</oor:items>
`;

export async function convertOfficeDocumentToPdf(buffer: Buffer, filename: string): Promise<ConversionResult> {
  const binary = await resolveSofficeBinary();
  if (!binary) return { status: "UNSUPPORTED" };

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-office-"));
  try {
    const safeName = path.basename(filename) || "document";
    const inputPath = path.join(workDir, safeName);
    await fs.writeFile(inputPath, buffer);

    // A per-conversion, per-request LibreOffice profile: soffice normally
    // locks a single shared profile to one running instance, so concurrent
    // conversions against the default profile can fail or block each other
    // waiting on that lock. Giving each request its own also lets the macro
    // lockdown above apply without touching any shared/global config.
    const profileDir = path.join(workDir, "loprofile");
    await fs.mkdir(path.join(profileDir, "user"), { recursive: true });
    await fs.writeFile(path.join(profileDir, "user", "registrymodifications.xcu"), MACRO_LOCKDOWN_XCU);

    await execFileAsync(
      binary,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        inputPath,
      ],
      { timeout: 30_000 },
    );

    const outputName = `${safeName.replace(/\.[^.]+$/, "")}.pdf`;
    const stat = await fs.stat(path.join(workDir, outputName));
    if (stat.size > MAX_CONVERTED_PDF_BYTES) {
      return { status: "FAILED", error: "Converted PDF exceeds the size limit" };
    }
    const pdf = await fs.readFile(path.join(workDir, outputName));
    return { status: "READY", pdf };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[workspace office conversion] failed:", message);
    return { status: "FAILED", error: message };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
