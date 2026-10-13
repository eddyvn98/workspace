import JSZip from "jszip";

// Describes one embedded image (OCR / caption). Supplied by callers that have
// a user context for the vision model; absent callers skip embedded images.
export type DescribeImage = (buffer: Buffer, mimeType: string, filename: string) => Promise<string>;

export interface ExtractOptions {
  describeImage?: DescribeImage;
}

// Each caption is a vision-model round trip, so a picture-heavy document is
// capped instead of turning one upload into dozens of slow calls.
const MAX_EMBEDDED_IMAGES = 12;
const MIN_IMAGE_BYTES = 2_000;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function createImageDescriber(options: ExtractOptions | undefined) {
  let used = 0;
  return async (buffer: Buffer, mimeType: string, filename: string): Promise<string> => {
    const describe = options?.describeImage;
    if (!describe || used >= MAX_EMBEDDED_IMAGES || buffer.length < MIN_IMAGE_BYTES) return "";
    used += 1;
    try {
      return (await describe(buffer, mimeType, filename)).replace(/\s+/g, " ").trim();
    } catch {
      // Best-effort: one failed caption must not fail the whole document.
      return "";
    }
  };
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function paragraphsOf(xml: string): string[] {
  return [...xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)]
    .map(([paragraph]) =>
      [...paragraph.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(([, t]) => decodeXml(t)).join(""),
    )
    .filter((line) => line.trim().length > 0);
}

function slideNumber(path: string): number {
  return parseInt(path.match(/(\d+)\.xml$/)?.[1] ?? "0", 10);
}

async function slideImages(zip: JSZip, slidePath: string, xml: string) {
  const relsPath = slidePath.replace("slides/", "slides/_rels/") + ".rels";
  const rels = await zip.file(relsPath)?.async("string");
  if (!rels) return [];
  const targets = new Map<string, string>();
  for (const [, tag] of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target);
  }
  const embedded = [...xml.matchAll(/r:embed="([^"]+)"/g)].map(([, id]) => targets.get(id));
  return embedded.filter((target): target is string => Boolean(target));
}

// Reads .pptx directly (slide text, tables, speaker notes and the text inside
// pictures) so the image does not depend on a Python toolchain.
export async function extractPptxText(buffer: Buffer, options?: ExtractOptions): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const describe = createImageDescriber(options);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const blocks: string[] = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.file(slidePath)!.async("string");
    const lines = paragraphsOf(xml);

    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${slideNumber(slidePath)}.xml`)?.async("string");
    const notes = notesXml ? paragraphsOf(notesXml) : [];

    for (const target of await slideImages(zip, slidePath, xml)) {
      const mediaPath = target.replace(/^\.\.\//, "ppt/");
      const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME_BY_EXT[ext];
      const file = mime ? zip.file(mediaPath) : null;
      if (!file || !mime) continue;
      const caption = await describe(await file.async("nodebuffer"), mime, mediaPath.split("/").pop() ?? "image");
      if (caption) lines.push(`[Image: ${caption}]`);
    }

    const body = [...lines, ...(notes.length ? ["Notes:", ...notes] : [])].join("\n");
    blocks.push(`[Slide ${slideNumber(slidePath)}]\n${body}`);
  }
  return blocks.join("\n\n").trim();
}
