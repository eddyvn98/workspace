import JSZip from "jszip";
import { parseXml, readRelationships, relationshipPath } from "./xml";
export const PPTX_IMPORT_LIMITS = { fileBytes: 25_000_000, expandedBytes: 80_000_000, entryBytes: 15_000_000, entries: 2500, slides: 60 } as const;
type Entry = { size: number };
// JSZip documents internalStream(), but its bundled declaration omits this browser API.
interface BoundedStream {
  on(event: "data", callback: (chunk: Uint8Array) => void): BoundedStream;
  on(event: "error", callback: (error: unknown) => void): BoundedStream;
  on(event: "end", callback: () => void): BoundedStream;
  pause(): BoundedStream;
  resume(): BoundedStream;
}

/** Check central-directory sizes BEFORE inflation. Reject ambiguous names, encryption and ZIP64. */
export function inspectPptxZip(bytes: Uint8Array): Map<string, Entry> {
  const lim = PPTX_IMPORT_LIMITS;
  if (bytes.length < 22 || bytes.length > lim.fileBytes) throw new Error("PPTX must be a ZIP file under 25 MB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error("Invalid or multipart PPTX ZIP");
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
  if (count !== view.getUint16(end + 8, true) || count > lim.entries || start === 0xffffffff || start + size !== end) {
    throw new Error("PPTX ZIP64 or excessive ZIP entries are not supported");
  }
  const names = new Map<string, Entry>(), decoder = new TextDecoder("utf-8", { fatal: true });
  let at = start, total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true), expanded = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true), next = at + 46 + nameLength + extra + comment;
    if (next > end || flags & 1 || ![0, 8].includes(method) || view.getUint16(at + 34, true) || expanded > lim.entryBytes || compressed > bytes.length) {
      throw new Error("Unsupported, encrypted or oversized PPTX entry");
    }
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (!name || /[\\\u0000-\u001f:%?#]/.test(name) || name.startsWith("/") || name.split("/").some(p => p === ".." || p === ".") || names.has(name)) {
      throw new Error("Unsafe or duplicate PPTX entry path");
    }
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags) {
      throw new Error("Mismatched PPTX ZIP headers");
    }
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtra;
    if (dataStart + compressed > start || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) throw new Error("Invalid ZIP entry range");
    total += expanded;
    if (total > lim.expandedBytes) throw new Error("PPTX expanded content exceeds 80 MB");
    names.set(name, { size: expanded }); at = next;
  }
  if (at !== end || !names.has("[Content_Types].xml")) throw new Error("Not an Office Open XML package");
  return names;
}

export class PptxArchive {
  private cache = new Map<string, Promise<Uint8Array>>();
  private inflated = 0;
  private constructor(private zip: JSZip, readonly entries: Map<string, Entry>, readonly signal?: AbortSignal) {}
  static async open(bytes: Uint8Array, signal?: AbortSignal): Promise<PptxArchive> {
    signal?.throwIfAborted();
    const entries = inspectPptxZip(bytes);
    const zip = await JSZip.loadAsync(bytes, { createFolders: false });
    for (const [name, file] of Object.entries(zip.files)) {
      if (!entries.has(name) || (file.unsafeOriginalName && file.unsafeOriginalName !== name)) throw new Error("Ambiguous PPTX ZIP filename");
    }
    return new PptxArchive(zip, entries, signal);
  }
  bytes(path: string, limit: number = PPTX_IMPORT_LIMITS.entryBytes): Promise<Uint8Array> {
    this.signal?.throwIfAborted();
    const info = this.entries.get(path), file = this.zip.file(path);
    if (!info || !file || info.size > limit) return Promise.reject(new Error(`Missing or oversized PPTX part: ${path}`));
    const cached = this.cache.get(path); if (cached) return cached;
    // Bound actual streamed output too; trusting only declared ZIP lengths permits zip bombs.
    const pending = new Promise<Uint8Array>((resolve, reject) => {
      const stream = (file as JSZip.JSZipObject & { internalStream(type: "uint8array"): BoundedStream }).internalStream("uint8array"), chunks: Uint8Array[] = [];
      let length = 0, done = false;
      const finish = () => { done = true; this.signal?.removeEventListener("abort", aborted); };
      const fail = (error: unknown) => { if (done) return; finish(); stream.pause(); reject(error); };
      const aborted = () => fail(new Error("PPTX import cancelled"));
      this.signal?.addEventListener("abort", aborted, { once: true });
      stream.on("data", (chunk: Uint8Array) => {
        if (done) return;
        length += chunk.length; this.inflated += chunk.length;
        if (length > info.size || length > limit || this.inflated > PPTX_IMPORT_LIMITS.expandedBytes) { fail(new Error("PPTX decompression limit exceeded")); return; }
        chunks.push(chunk);
      }).on("error", fail).on("end", () => {
        if (done) return;
        if (length !== info.size) { fail(new Error("PPTX entry length mismatch")); return; }
        finish(); const output = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
        resolve(output);
      }).resume();
    });
    this.cache.set(path, pending); return pending;
  }
  async xml(path: string): Promise<Document> {
    const bytes = await this.bytes(path, 3_000_000);
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    return parseXml(new TextDecoder(encoding, { fatal: true }).decode(bytes), path);
  }
  async relationships(part: string) {
    const path = relationshipPath(part);
    return readRelationships(this.entries.has(path) ? await this.xml(path) : null, part);
  }
}
