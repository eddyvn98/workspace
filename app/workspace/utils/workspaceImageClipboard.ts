const IMAGE_URL_PATTERN = /^(?:https?:\/\/[^\s\n\r"']+\.(?:png|jpg|jpeg|webp|gif|svg)(?:\?[^\s\n\r"']*)?|data:image\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+|blob:[^\s\n\r"']+)$/i;
const APP_HOSTED_IMAGE_PATTERN = /^https?:\/\/[^\s"']+\/(?:api\/workspace-images|files)\/[^\s"']+/i;

export function isWorkspaceHostedImageUrl(value: string): boolean {
  return APP_HOSTED_IMAGE_PATTERN.test(value.trim());
}

export interface WorkspacePastedImageSize {
  width: number;
  height: number;
}

function positiveNumber(value: string | undefined): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function extractWorkspacePastedImageUrl(value: string, html?: string): string | null {
  const trimmed = value.trim();
  if (IMAGE_URL_PATTERN.test(trimmed) || APP_HOSTED_IMAGE_PATTERN.test(trimmed)) return trimmed;
  const imageTags = html?.match(/<img\b[^>]*>/gi);
  if (!imageTags || imageTags.length !== 1) return null;
  if (/<(?:p|div|span|h[1-6]|li|table)\b/i.test(html?.replace(/<!--[\s\S]*?-->/g, "") ?? "")) return null;
  const src = imageTags[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&").trim();
  if (!src || (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("blob:"))) return null;
  return src;
}

export function extractWorkspacePastedImageSize(html?: string): WorkspacePastedImageSize | undefined {
  const tag = html?.match(/<img\b[^>]*>/i)?.[0];
  if (!tag) return undefined;
  const read = (name: string) => positiveNumber(tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]);
  const width = read("data-mm-width") ?? read("width");
  const height = read("data-mm-height") ?? read("height");
  return width && height ? { width, height } : undefined;
}

export function readWorkspaceImageSize(source: string | Blob): Promise<WorkspacePastedImageSize | undefined> {
  const objectUrl = typeof source === "string" ? undefined : URL.createObjectURL(source);
  const src: string = objectUrl ?? (source as string);
  return new Promise((resolve) => {
    const image = new Image();
    const cleanup = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    image.onload = () => {
      cleanup();
      const { naturalWidth: width, naturalHeight: height } = image;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    image.onerror = () => { cleanup(); resolve(undefined); };
    image.src = src;
  });
}

export function fitWorkspaceImageSize(
  natural: WorkspacePastedImageSize | undefined,
  max: WorkspacePastedImageSize = { width: 240, height: 180 },
): WorkspacePastedImageSize {
  if (!natural || natural.width <= 0 || natural.height <= 0) return max;
  const scale = Math.min(1, max.width / natural.width, max.height / natural.height);
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) };
}
