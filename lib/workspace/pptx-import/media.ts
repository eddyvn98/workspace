import type { ImportAsset, NoticeSink } from "./model";
import { PptxArchive } from "./archive";
/** Inspect raster headers before upload; SVG/EMF/OLE are never executed or injected. */
export function rasterInfo(bytes: Uint8Array): { mime: string; width: number; height: number } | null {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let mime = "", width = 0, height = 0;
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) {
    mime="image/png"; width=d.getUint32(16); height=d.getUint32(20);
  } else if (bytes.length >= 10 && String.fromCharCode(...bytes.subarray(0,6)).match(/^GIF8[79]a$/)) {
    mime="image/gif"; width=d.getUint16(6,true); height=d.getUint16(8,true);
  } else if (bytes.length >= 4 && bytes[0]===0xff && bytes[1]===0xd8) {
    let at=2;
    while (at+4 <= bytes.length) {
      if (bytes[at]!==0xff) break;
      while (bytes[at]===0xff) at++;
      const marker=bytes[at++];
      if (marker===0xd9 || marker===0xda) break;
      if (marker===1 || marker>=0xd0 && marker<=0xd7) continue;
      const length=d.getUint16(at);
      if (length<2 || at+length>bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length>=7) {
        mime="image/jpeg"; height=d.getUint16(at+3); width=d.getUint16(at+5); break;
      }
      at += length;
    }
  }
  if (!mime) return null;
  if (!width || !height || width*height>25_000_000) throw new Error("An embedded picture exceeds 25 megapixels");
  return { mime,width,height };
}
export async function loadAsset(archive: PptxArchive, path: string, assets: Map<string,ImportAsset>, notice: NoticeSink): Promise<ImportAsset | undefined> {
  if (assets.has(path)) return assets.get(path);
  const bytes=await archive.bytes(path), info=rasterInfo(bytes);
  if (!info) { notice("image-format", `Picture ${path.split("/").pop()} was omitted (only PNG, JPEG and GIF are supported).`); return; }
  if (info.mime==="image/gif") notice("gif", "Animated GIF playback may differ between the editor and PowerPoint export.");
  const asset={...info,bytes,name:path.split("/").pop() || "picture",src:`/__pptx_import_asset/${assets.size}`};
  assets.set(path,asset); return asset;
}
