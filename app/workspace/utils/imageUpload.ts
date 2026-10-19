"use client";

const MAX_DIMENSION = 1600;
const SKIP_COMPRESSION_SIZE = 150 * 1024; // 150KB
const COMPRESSED_QUALITY = 0.82;

async function compressImageBlob(file: File): Promise<Blob> {
  if (typeof window === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }
  if (file.size < SKIP_COMPRESSION_SIZE || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    if (maxSide <= MAX_DIMENSION && file.size < 500 * 1024) {
      return file;
    }
    const scale = Math.min(1, MAX_DIMENSION / maxSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", COMPRESSED_QUALITY);
    });
    return blob ?? file;
  } catch (err) {
    console.warn("Client-side image compression fallback to original:", err);
    return file;
  } finally {
    bitmap?.close();
  }
}

/**
 * Reads a file into a base64 Data URL.
 */
export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

async function uploadRaw(blob: Blob, filename: string, signal?: AbortSignal): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", blob, filename);
  const res = await fetch("/api/workspace-images", { method: "POST", body: formData, signal });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data?.url === "string" && data.url ? data.url : null;
}

/** Uploads an image file to the real workspace image endpoint. */
export async function uploadOrReadWorkspaceImage(file: File): Promise<string | null> {
  if (!file || !file.type.startsWith("image/")) return null;
  try {
    const blobToUpload = await compressImageBlob(file);
    return await uploadRaw(blobToUpload, file.name);
  } catch (err) {
    console.error("Upload to /api/workspace-images failed:", err);
    return null;
  }
}

/**
 * Uploads an image for canvas use, keeping both a compressed rendition (for
 * on-canvas display — smaller payload, faster pan/zoom) and the original
 * bytes (for Download, which must never hand back a lossy copy). When
 * compressImageBlob decides compression isn't worth it (small file, already
 * within bounds, svg/gif), it returns the same File reference — detected
 * here to skip the second upload and point both URLs at one blob.
 */
export async function uploadWorkspaceImageWithOriginal(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<{ url: string; downloadUrl: string } | null> {
  if (!file || !file.type.startsWith("image/") || options.signal?.aborted) return null;
  try {
    const compressedBlob = await compressImageBlob(file);
    if (options.signal?.aborted) return null;
    if (compressedBlob === file) {
      const url = await uploadRaw(file, file.name, options.signal);
      return url ? { url, downloadUrl: url } : null;
    }
    const [downloadUrl, url] = await Promise.all([
      uploadRaw(file, file.name, options.signal),
      uploadRaw(compressedBlob, file.name, options.signal),
    ]);
    if (!downloadUrl || !url) return null;
    return { url, downloadUrl };
  } catch (err) {
    if (options.signal?.aborted) return null;
    console.error("Upload to /api/workspace-images failed:", err);
    return null;
  }
}

/** Fetches a pasted foreign image once so a canvas block can keep a reload-safe URL. */
export async function fetchAndRehostWorkspaceImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const filename = url.split("/").pop()?.split("?")[0]?.split("#")[0] || "pasted-image";
    return uploadOrReadWorkspaceImage(new File([blob], filename, { type: blob.type }));
  } catch (error) {
    console.warn("Failed to re-host workspace pasted image; keeping source URL", error);
    return null;
  }
}
