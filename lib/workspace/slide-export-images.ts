import sharp from "sharp";
export type SlideImageReader = (fileId: string) => Promise<{ buffer: Buffer } | null>;
export type ExportImage = { buffer: Buffer; width: number; height: number; index: number };

export function slideExportImages(readImage: SlideImageReader) {
  const images = new Map<string, Promise<ExportImage>>();
  let count = 0, bytes = 0;
  return (src: string): Promise<ExportImage> => {
    if (images.has(src)) return images.get(src)!;
    const promise = (async () => {
      const match = /^\/api\/workspace-images\/(ws_[a-f0-9]+)$/.exec(src);
      if (!match) throw new Error("Slide export images must be uploaded to the workspace first.");
      const file = await readImage(match[1]);
      if (!file || file.buffer.length > 15_000_000) throw new Error("A slide image is missing or larger than 15 MB.");
      let png;
      try {
        png = await sharp(file.buffer, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      } catch { throw new Error("A slide image cannot be decoded safely. Upload it again as PNG or JPEG."); }
      bytes += png.data.length;
      if (bytes > 40_000_000) throw new Error("Slide images exceed the 40 MB export limit.");
      return { buffer: png.data, width: png.info.width, height: png.info.height, index: ++count };
    })();
    images.set(src, promise); return promise;
  };
}
