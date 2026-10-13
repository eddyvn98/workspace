export interface WorkspaceImageClipboardMetadata {
  url: string;
  width?: number;
  height?: number;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function clipboardMarkup(metadata: WorkspaceImageClipboardMetadata): string {
  const { url, width, height } = metadata;
  const size = width && height
    ? ` width="${width}" height="${height}" data-mm-width="${width}" data-mm-height="${height}"`
    : "";
  return `<img src="${escapeAttribute(url)}"${size} />`;
}

async function encodeWithImageElement(blob: Blob): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const source = URL.createObjectURL(blob);
  try {
    return await new Promise<Blob | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0);
        void canvas.toBlob(resolve, "image/png");
      };
      image.onerror = () => resolve(null);
      image.src = source;
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function encodeAsPng(blob: Blob): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (png) return png;
    } catch {
      // Chromium can reject a blob that HTMLImageElement can still decode.
    }
  }
  return encodeWithImageElement(blob);
}

/** Copies image bytes plus the metadata understood by the Workspace paste path. */
export async function writeWorkspaceImageToClipboard(
  metadata: WorkspaceImageClipboardMetadata,
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    const response = await fetch(metadata.url);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const png = await encodeAsPng(await response.blob());
    if (png && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "image/png": png,
        "text/html": new Blob([clipboardMarkup(metadata)], { type: "text/html" }),
        "text/plain": new Blob([metadata.url], { type: "text/plain" }),
      })]);
      return true;
    }
  } catch (error) {
    console.warn("Workspace image clipboard byte copy failed; falling back to URL", error);
  }

  try {
    await navigator.clipboard.writeText(metadata.url);
    return true;
  } catch (error) {
    console.warn("Workspace image clipboard URL copy failed", error);
    return false;
  }
}
