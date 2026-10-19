import { safeDocImageUrl } from './workspaceDocSafety';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const ACCEPTED_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('An image could not be prepared for export.'));
    reader.readAsDataURL(blob);
  });
}

/** Inline images so exported HTML/SVG does not lose authenticated assets or taint the canvas. */
export async function inlineWorkspaceDocImages(body: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(`<article>${body}</article>`, 'text/html');
  const root = parsed.body.firstElementChild!;
  let totalBytes = 0;
  const loaded = new Map<string, Promise<string>>();
  const load = (source: string) => {
    if (!safeDocImageUrl(source)) return Promise.reject(new Error('A document image has an unsupported URL.'));
    let pending = loaded.get(source);
    if (!pending) {
      pending = (async () => {
        const absolute = new URL(source, window.location.href);
        const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(absolute.href, { credentials: absolute.origin === window.location.origin ? 'same-origin' : 'omit', signal: controller.signal });
          if (!response.ok) throw new Error('A document image could not be downloaded. Check image access and try again.');
          const mime = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
          if (!ACCEPTED_IMAGES.has(mime)) throw new Error('Document export supports PNG, JPEG, GIF, WebP and AVIF images. Replace this image before exporting.');
          if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('A document image exceeds the 20 MB export limit.');
          const parts: ArrayBuffer[] = [];
          let imageBytes = 0;
          const reader = response.body?.getReader();
          if (!reader) throw new Error('This browser could not read an image for export.');
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              imageBytes += value.byteLength; totalBytes += value.byteLength;
              if (imageBytes > MAX_IMAGE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
                controller.abort();
                throw new Error('Document images exceed the export size limit. Export a smaller document.');
              }
              parts.push(new Uint8Array(value).buffer);
            }
          } finally { reader.releaseLock(); }
          const blob = new Blob(parts, { type: mime });
          return await dataUrl(blob);
        } finally { window.clearTimeout(timeout); }
      })();
      loaded.set(source, pending);
    }
    return pending;
  };
  // Bound concurrent downloads instead of starting one request per image in a long document.
  const images = Array.from(root.querySelectorAll('img'));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, images.length) }, async () => {
    while (next < images.length) {
      const image = images[next++];
      const source = image.getAttribute('src') ?? '';
      image.setAttribute('src', await load(source));
    }
  }));
  // Keep original download links usable when the standalone file is opened outside this site.
  root.querySelectorAll('a[href]').forEach((link) => link.setAttribute('href', new URL(link.getAttribute('href')!, window.location.href).href));
  return root.innerHTML;
}
