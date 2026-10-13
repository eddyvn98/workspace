/**
 * lib/workspace/resource-storage.ts
 *
 * Private object storage for a WorkspaceResource's original file bytes.
 * Deliberately its own module rather than reusing lib/project-knowledge-
 * storage.ts: that module belongs to the unrelated legacy project-knowledge
 * feature (different tables, different callers) and its key scheme
 * (`project-knowledge/*`, `project-images/*`) has nothing to do with
 * workspace resources. Same disk-or-OSS backend choice, same env-driven
 * selection shape, new `workspace-resources/*` key namespace.
 *
 * No ACL enforcement here — this module only moves bytes. Every caller
 * (lib/workspace/resource-repository.ts) enforces board access before
 * reading or writing an object, same separation as the Postgres access
 * checks living in the repository layer, not in @/lib/prisma.
 */

import { promises as fs } from "fs";
import { createRequire } from "node:module";
import path from "path";

const OSS = createRequire(import.meta.url)("ali-oss");

type StorageBackend = "disk" | "oss";

interface OssClientLike {
  put(key: string, value: Buffer | string, options?: { headers?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

let cachedBackend: StorageBackend | null = null;
let cachedClient: OssClientLike | null = null;

function isOssConfigured(): boolean {
  return Boolean(
    process.env.OSS_REGION &&
      process.env.OSS_BUCKET &&
      process.env.OSS_ACCESS_KEY_ID &&
      process.env.OSS_ACCESS_KEY_SECRET,
  );
}

function resolveBackend(): StorageBackend {
  if (cachedBackend) return cachedBackend;

  const mode = (process.env.WORKSPACE_RESOURCE_STORAGE ?? "auto").trim().toLowerCase();
  if (mode === "disk") {
    cachedBackend = "disk";
    return cachedBackend;
  }

  if (mode === "oss") {
    if (!isOssConfigured()) {
      throw new Error(
        "WORKSPACE_RESOURCE_STORAGE=oss requires OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, and OSS_ACCESS_KEY_SECRET",
      );
    }
    cachedBackend = "oss";
    return cachedBackend;
  }

  cachedBackend = isOssConfigured() ? "oss" : "disk";
  return cachedBackend;
}

function getOssClient(): OssClientLike {
  if (cachedClient) return cachedClient;

  cachedClient = new OSS({
    region: process.env.OSS_REGION as string,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID as string,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET as string,
    bucket: process.env.OSS_BUCKET as string,
    endpoint: process.env.OSS_ENDPOINT as string | undefined,
    secure: process.env.OSS_SECURE !== "false",
  }) as OssClientLike;

  return cachedClient;
}

function toBuffer(content: unknown): Buffer {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === "string") return Buffer.from(content, "utf-8");
  if (content && typeof content === "object" && "data" in content) {
    const data = (content as { data?: unknown }).data;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return Buffer.from(data);
    if (typeof data === "string") return Buffer.from(data, "utf-8");
  }
  return Buffer.from(String(content ?? ""));
}

function diskPathFor(storageKey: string): string {
  // storageKey is always "workspace-resources/<resourceId>/v<n>", generated
  // by the repository layer, never taken from user input — safe to join.
  return path.join(process.cwd(), "data", storageKey);
}

/** Stores one version's bytes under `storageKey`. mimeType is kept private
 *  (x-oss-object-acl on OSS) since a resource's ACL comes from board access,
 *  not from the object store's own public/private setting for anything else
 *  in the bucket. */
export async function putResourceObject(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (resolveBackend() === "oss") {
    await getOssClient().put(storageKey, buffer, {
      headers: { "Content-Type": mimeType, "x-oss-object-acl": "private" },
    });
    return;
  }

  const filePath = diskPathFor(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export async function getResourceObject(storageKey: string): Promise<Buffer | null> {
  if (resolveBackend() === "oss") {
    try {
      const result = await getOssClient().get(storageKey);
      return toBuffer((result as { content?: unknown }).content ?? result);
    } catch {
      return null;
    }
  }

  try {
    return await fs.readFile(diskPathFor(storageKey));
  } catch {
    return null;
  }
}

export async function deleteResourceObject(storageKey: string): Promise<void> {
  if (resolveBackend() === "oss") {
    try {
      await getOssClient().delete(storageKey);
    } catch (err) {
      // A missing-object delete isn't an error worth logging, but this catch
      // was swallowing everything alike — a transient network/permission
      // failure looked identical to "already gone", so the Postgres row could
      // be deleted (deleteResourceCascade runs this after the row delete)
      // while the real object silently stayed behind, invisible to the
      // orphan sweep (resource-retention.ts only scans WorkspaceResource rows).
      console.warn(`[workspace resource storage] failed to delete OSS object ${storageKey}:`, err);
    }
    return;
  }

  try {
    await fs.unlink(diskPathFor(storageKey));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`[workspace resource storage] failed to delete file for ${storageKey}:`, err);
    }
  }
}
