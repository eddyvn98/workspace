export const MIN_DOC_IMAGE_WIDTH = 15;
export const MAX_DOC_IMAGE_BYTES = 15 * 1024 * 1024;
export type DocImageAlign = "left" | "center" | "right";

/** Keep percentage layout bounded and reject CSS expressions in persisted attrs. */
export function docImageWidth(value: unknown): string {
  const match = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?%?$/.test(value.trim()) ? Number.parseFloat(value) : 100;
  return `${Math.round(Math.max(MIN_DOC_IMAGE_WIDTH, Math.min(100, Number.isFinite(match) ? match : 100)))}%`;
}

export function docImageAlign(value: unknown): DocImageAlign {
  return value === "left" || value === "right" ? value : "center";
}

/** Uploads use same-origin paths; external images may use HTTP(S). */
export function safeDocImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
  try {
    const parsed = new URL(url, "https://workspace.invalid");
    return ["http:", "https:"].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function docImageFileError(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file.";
  if (!file.size) return "This image file is empty.";
  if (file.size > MAX_DOC_IMAGE_BYTES) return "Choose an image smaller than 15 MB.";
  return null;
}
