import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { exportBoardPptx } from "@/lib/workspace/pptx-export";
import { exportBoardPdf } from "@/lib/workspace/pdf-export";
import { boardExportSlides, slideElements } from "@/lib/workspace/slide-export-scene";
import { slideExportImages } from "@/lib/workspace/slide-export-images";

const deck = (slides: Record<string, any>, extra = {}) => ({ type: "slideDeck", data: { slides, slideOrder: Object.keys(slides), theme: { backgroundColor: "rgb(15,23,42)", textColor: "#f1f5f9", accentColor: "#2563eb" }, ...extra } });
const slide = (html: string, extra = {}) => ({ id: "s", name: "Dữ liệu", html, presenterNotes: "Ghi chú chính xác & đầy đủ", transition: "zoom", ...extra });
const board = { title: "Báo cáo", blockOrder: ["deck", "other"], blocks: {
  deck: deck({ s: slide('<h2>Kết quả</h2><table><tr><th>Khu vực</th><th>Giá trị</th></tr><tr><td>Miền Bắc</td><td>135</td></tr></table><div data-slide-chart="bar" data-series="[{&quot;label&quot;:&quot;Miền Bắc&quot;,&quot;value&quot;:135}]"></div><img src="/api/workspace-images/ws_123abc" alt="Hình gốc"/>'), hidden: slide("<p>Do not export</p>", { hidden: true }) }),
  other: { type: "text" },
} };

describe("Slide files", () => {
  it("builds editable OOXML tables/charts with source data, embedded images, transitions and notes", async () => {
    const image = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } }).png().toBuffer();
    const reader = vi.fn(async () => ({ buffer: image }));
    const result = await exportBoardPptx(board, ["deck"], reader);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(result.slideCount).toBe(1); expect(reader).toHaveBeenCalledWith("ws_123abc");
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain("<a:tbl>"); expect(xml).toContain("135"); expect(xml).toContain("<c:chart");
    expect(xml).toContain("<p:pic>"); expect(xml).toContain('<p:zoom dir="in"/>'); expect(xml).toContain('val="0F172A"');
    const chart = await zip.file("ppt/charts/chart1.xml")!.async("string");
    expect(chart).toContain('<c:crosses val="autoZero"/><c:lblAlgn');
    expect(chart).toContain('<c:showLegendKey val="0"/>');
    expect(xml).not.toContain("Do not export");
    expect(await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string")).toContain("Ghi chú chính xác &amp; đầy đủ");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await zip.file("ppt/embeddings/chart1.xlsx")!.async("nodebuffer") as any);
    expect(workbook.worksheets[0].getCell("B2").value).toBe(135);
    expect((await sharp(await zip.file("ppt/media/image1.png")!.async("nodebuffer")).metadata()).width).toBe(40);
    const names = Object.keys(zip.files).filter((name) => name.endsWith(".rels"));
    for (const name of names) {
      const rels = await zip.file(name)!.async("string");
      for (const match of rels.matchAll(/Target="([^"]+)"/g)) {
        const base = name === "_rels/.rels" ? "" : name.slice(0, name.lastIndexOf("/_rels/"));
        const path = new URL(`${base}/${match[1]}`.replace(/^\//, ""), "https://package/").pathname.slice(1);
        expect(zip.file(path), `${name} -> ${path}`).not.toBeNull();
      }
    }
  });
  it("generates a real PDF with one visible slide and complete object offsets", async () => {
    const b = { ...board, blocks: { deck: deck({ a: slide("<h2>Báo cáo tiếng Việt</h2><p>Miền Bắc: 135</p>"), b: slide("hidden", { hidden: true }) }) }, blockOrder: ["deck"] };
    const result = await exportBoardPdf(b, undefined, async () => null), text = result.buffer.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true); expect(text).toContain("/Count 1");
    expect(text).toContain("/Filter /DCTDecode"); expect(result.slideCount).toBe(1);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]); expect(text.slice(xref, xref + 4)).toBe("xref");
  });
  it("rejects nonexistent selections, incompatible ratios, excessive content and invalid chart data", async () => {
    expect(() => boardExportSlides(board, ["missing"])).toThrow("existing blocks");
    expect(() => boardExportSlides(board, ["other"])).toThrow("slide decks only");
    expect(() => boardExportSlides({ blocks: { a: deck({ x: slide("a") }), b: deck({ x: slide("b") }, { aspectRatio: "4:3" }) }, blockOrder: ["a", "b"] })).toThrow("same aspect ratio");
    expect(() => slideElements('<div data-slide-chart="bar" data-series="[]"></div>')).toThrow("invalid persisted data");
    await expect(exportBoardPptx({ title: "x", blocks: { a: deck({ x: slide(`<p>${"Long content ".repeat(3000)}</p>`) }) }, blockOrder: ["a"] }, undefined, async () => null)).rejects.toThrow("Split it");
  });
  it("never fetches remote image URLs and deduplicates safe uploads", async () => {
    const reader = vi.fn(async () => ({ buffer: Buffer.from("invalid image") })), load = slideExportImages(reader);
    await expect(load("https://external/image.png")).rejects.toThrow("uploaded"); expect(reader).not.toHaveBeenCalled();
    await expect(load("/api/workspace-images/ws_abc")).rejects.toThrow("decoded safely");
    await expect(load("/api/workspace-images/ws_abc")).rejects.toThrow("decoded safely"); expect(reader).toHaveBeenCalledTimes(1);
  });
  it("keeps images in layout table cells instead of silently dropping them", () => {
    expect(slideElements('<table><tr><td>Caption<img src="/api/workspace-images/ws_a"/></td></tr></table>').map((e) => e.kind)).toEqual(["table", "image"]);
  });
});
