import JSZip from "jszip";
import { SHEET_LIMITS as LIMIT } from "./limits";

// JSZip 3.10 documents this public streaming API, but omits it from its typings.
interface InflatedStream {
  on(event: "data", callback: (chunk: Uint8Array) => void): InflatedStream;
  on(event: "error", callback: (error: Error) => void): InflatedStream;
  on(event: "end", callback: () => void): InflatedStream;
  pause(): InflatedStream;
  resume(): InflatedStream;
}
/** Inspect metadata before allocating XML. Reject ambiguous ZIPs, ZIP64 and
 * unsupported active content; then count ACTUAL inflated bytes as a stream. */
export async function inspectXlsx(bytes: Uint8Array): Promise<string[]> {
  if (bytes.byteLength < 22 || bytes.byteLength > LIMIT.fileBytes) throw new Error("XLSX must be a ZIP workbook of at most 10 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error("Invalid or truncated XLSX archive.");
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count
    || count > LIMIT.zipEntries || start === 0xffffffff || size === 0xffffffff || start + size !== end) throw new Error("Unsupported XLSX archive structure.");
  let cursor = start, expanded = 0;
  const names = new Set<string>(), decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
    const flags = view.getUint16(cursor + 8, true), compression = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
    const length = view.getUint16(cursor + 28, true), local = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    if (next > end || flags & 1 || ![0, 8].includes(compression) || view.getUint16(cursor + 34, true)
      || uncompressed === 0xffffffff || compressed === 0xffffffff || local + 30 > start) throw new Error("Unsupported ZIP entry.");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + length));
    if (!name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..") || names.has(name)) throw new Error("Unsafe or duplicate ZIP path.");
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error("Invalid ZIP local header.");
    const localLength = view.getUint16(local + 26, true), payload = local + 30 + localLength + view.getUint16(local + 28, true);
    if (payload + compressed > start || view.getUint16(local + 8, true) !== compression || view.getUint16(local + 6, true) !== flags
      || decoder.decode(bytes.subarray(local + 30, local + 30 + localLength)) !== name) throw new Error("Inconsistent ZIP headers.");
    expanded += uncompressed;
    if (expanded > LIMIT.expandedBytes) throw new Error("XLSX expands beyond 50 MiB.");
    if (/vbaProject|externalLinks\/|embeddings\//i.test(name)) throw new Error("Macros, external workbook links and embedded objects are not supported.");
    names.add(name); cursor = next;
  }
  if (cursor !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw new Error("Not an XLSX workbook.");
  const zip = await JSZip.loadAsync(bytes);
  let actual = 0;
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    await new Promise<void>((resolve, reject) => {
      const stream = (file as typeof file & { internalStream(type: "uint8array"): InflatedStream }).internalStream("uint8array");
      let failed = false;
      stream.on("data", (chunk: Uint8Array) => {
        actual += chunk.length;
        if (actual > LIMIT.expandedBytes && !failed) { failed = true; stream.pause(); reject(new Error("XLSX inflated data exceeds 50 MiB.")); }
      }).on("error", reject).on("end", () => { if (!failed) resolve(); }).resume();
    });
  }
  return [...names];
}
