import { promises as fs } from "fs";
import path from "path";

const OSS = require("ali-oss");

const DISK_TEXT_DIR = path.join(process.cwd(), "data", "project-knowledge");
const DISK_IMAGE_DIR = path.join(process.cwd(), "data", "project-images");

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

  const mode = (process.env.PROJECT_KNOWLEDGE_STORAGE ?? "auto").trim().toLowerCase();
  if (mode === "disk") {
    cachedBackend = "disk";
    return cachedBackend;
  }

  if (mode === "oss") {
    if (!isOssConfigured()) {
      throw new Error(
        "PROJECT_KNOWLEDGE_STORAGE=oss requires OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, and OSS_ACCESS_KEY_SECRET",
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

async function ensureDiskDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(DISK_TEXT_DIR, { recursive: true }),
    fs.mkdir(DISK_IMAGE_DIR, { recursive: true }),
  ]);
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

function getTextKey(fileId: string): string {
  return `project-knowledge/${fileId}.txt`;
}

function getImageKey(fileId: string): string {
  return `project-images/${fileId}`;
}

function getImageMimeKey(fileId: string): string {
  return `project-images/${fileId}.mime`;
}

export async function saveKnowledgeText(fileId: string, text: string): Promise<void> {
  if (resolveBackend() === "oss") {
    await getOssClient().put(getTextKey(fileId), Buffer.from(text, "utf-8"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
    return;
  }

  await ensureDiskDirs();
  await fs.writeFile(path.join(DISK_TEXT_DIR, `${fileId}.txt`), text, "utf-8");
}

export async function readKnowledgeText(fileId: string): Promise<string | null> {
  if (resolveBackend() === "oss") {
    try {
      const result = await getOssClient().get(getTextKey(fileId));
      const content = toBuffer((result as { content?: unknown }).content ?? result);
      return content.toString("utf-8");
    } catch {
      return null;
    }
  }

  try {
    return await fs.readFile(path.join(DISK_TEXT_DIR, `${fileId}.txt`), "utf-8");
  } catch {
    return null;
  }
}

export async function deleteKnowledgeText(fileId: string): Promise<void> {
  if (resolveBackend() === "oss") {
    try {
      await getOssClient().delete(getTextKey(fileId));
    } catch {
      // ignore missing object
    }
    return;
  }

  try {
    await fs.unlink(path.join(DISK_TEXT_DIR, `${fileId}.txt`));
  } catch {
    // Silent fail on ENOENT
  }
}

export async function saveKnowledgeImage(fileId: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (resolveBackend() === "oss") {
    const client = getOssClient();
    await client.put(getImageKey(fileId), buffer, {
      headers: {
        "Content-Type": mimeType,
        "x-oss-object-acl": "private",
      },
    });
    await client.put(getImageMimeKey(fileId), Buffer.from(mimeType, "utf-8"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
    return;
  }

  await ensureDiskDirs();
  await fs.writeFile(path.join(DISK_IMAGE_DIR, fileId), buffer);
  await fs.writeFile(path.join(DISK_IMAGE_DIR, `${fileId}.mime`), mimeType, "utf-8");
}

export async function readKnowledgeImage(fileId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (resolveBackend() === "oss") {
    try {
      const [imageResult, mimeResult] = await Promise.all([
        getOssClient().get(getImageKey(fileId)),
        getOssClient().get(getImageMimeKey(fileId)),
      ]);
      const buffer = toBuffer((imageResult as { content?: unknown }).content ?? imageResult);
      const mimeType = toBuffer((mimeResult as { content?: unknown }).content ?? mimeResult).toString("utf-8");
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  try {
    const buffer = await fs.readFile(path.join(DISK_IMAGE_DIR, fileId));
    const mimeType = await fs.readFile(path.join(DISK_IMAGE_DIR, `${fileId}.mime`), "utf-8");
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

export async function deleteKnowledgeImage(fileId: string): Promise<void> {
  if (resolveBackend() === "oss") {
    try {
      await getOssClient().delete(getImageKey(fileId));
    } catch {
      // ignore missing object
    }
    try {
      await getOssClient().delete(getImageMimeKey(fileId));
    } catch {
      // ignore missing object
    }
    return;
  }

  try {
    await fs.unlink(path.join(DISK_IMAGE_DIR, fileId));
  } catch {
    // ignore
  }
  try {
    await fs.unlink(path.join(DISK_IMAGE_DIR, `${fileId}.mime`));
  } catch {
    // ignore
  }
}
