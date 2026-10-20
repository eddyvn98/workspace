import sharp from "sharp";
import { boardExportSlides } from "./slide-export-scene";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { slideScenePdfSvg } from "./pdf-scene";
import { xml } from "./pptx-elements";
import { slideExportImages, type SlideImageReader } from "./slide-export-images";
import { slideExportLayout, wrapExportText } from "./slide-export-layout";
import { slideExportStyle } from "./slide-export-style";

function svgText(text: string, x: number, y: number, width: number, size: number, fill: string, bold = false) {
  const lines = wrapExportText(text, Math.max(1, Math.floor(width / (size * 0.55))));
  return `<text x="${x}" y="${y + size}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" fill="#${fill}"${bold ? ' font-weight="bold"' : ""}>${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.3 : 0}">${xml(line)}</tspan>`).join("")}</text>`;
}

/** Each PDF page is an embedded high-resolution rendering, so fonts and uploaded images travel with the file. */
export async function exportBoardPdf(board: { blocks: unknown; blockOrder: unknown }, ids: unknown, readImage: SlideImageReader) {
  const slides = boardExportSlides(board, ids), width = slides[0].width, loadImage = slideExportImages(readImage), style = slideExportStyle();
  const pages: Buffer[] = [];
  for (const [i, { slide, theme, elements }] of slides.entries()) {
    const scene = normalizeSlideScene(slide.scene, width === 960 ? "4:3" : "16:9");
    if (slide.scene && !scene) throw new Error(`Slide ${i + 1} has invalid Scene V2 data.`);
    const { heights, contentWidth, scale } = scene ? { heights: [] as number[], contentWidth: width - 112, scale: 1 } : slideExportLayout(elements, width, i);
    const { fill, accent, background } = await style(slide, theme);
    const shapes: string[] = []; let y = 48;
    if (scene) shapes.push(await slideScenePdfSvg(scene, width, loadImage));
    for (const [j, element] of elements.entries()) {
      const height = heights[j] * scale;
      if (element.kind === "text") shapes.push(svgText(element.text, 56, y, contentWidth, (element.heading ? 42 : 27) * scale, fill, element.heading));
      if (element.kind === "table") {
        const cols = Math.max(1, ...element.rows.map((r) => r.length)), rowHeight = height / element.rows.length, cellWidth = contentWidth / cols;
        element.rows.forEach((row, r) => Array.from({ length: cols }, (_, c) => {
          shapes.push(`<rect x="${56 + c * cellWidth}" y="${y + r * rowHeight}" width="${cellWidth}" height="${rowHeight}" fill="#${r === 0 ? accent : "F1F5F9"}" stroke="#CBD5E1" stroke-width="1"/>`);
          shapes.push(svgText(row[c] ?? "", 56 + c * cellWidth + 12 * scale, y + r * rowHeight + 6 * scale, cellWidth - 24 * scale, Math.min(24 * scale, rowHeight * 0.5), r === 0 ? "FFFFFF" : "111827", r === 0));
        }));
      }
      if (element.kind === "image") {
        const image = await loadImage(element.src), ratio = Math.min(contentWidth / image.width, height / image.height);
        const w = image.width * ratio, h = image.height * ratio;
        shapes.push(`<image x="${56 + (contentWidth - w) / 2}" y="${y + (height - h) / 2}" width="${w}" height="${h}" href="data:image/png;base64,${image.buffer.toString("base64")}"/>`);
      }
      if (element.kind === "chart") {
        const maximum = Math.max(1, ...element.series.map((s) => s.value)), rowHeight = height / element.series.length;
        const labelWidth = contentWidth * 0.25, barWidth = contentWidth - labelWidth - 110 * scale;
        element.series.forEach((entry, n) => {
          const top = y + n * rowHeight;
          shapes.push(svgText(entry.label, 56, top + 8 * scale, labelWidth - 10, 23 * scale, fill));
          const w = entry.value / maximum * barWidth;
          shapes.push(`<rect x="${56 + labelWidth}" y="${top + 8 * scale}" width="${w}" height="${Math.max(1, rowHeight - 24 * scale)}" rx="${4 * scale}" fill="#${accent}"/>`);
          shapes.push(svgText(String(entry.value), 56 + labelWidth + w + 12 * scale, top + 8 * scale, 95 * scale, 23 * scale, fill, true));
        });
      }
      y += height + 14 * scale;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="720"><rect width="100%" height="100%" fill="#${background}"/>${shapes.join("")}</svg>`;
    pages.push(await sharp(Buffer.from(svg), { density: 144, limitInputPixels: 5_000_000 }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer());
  }
  return { buffer: pdfPages(pages, width * 0.75, 540), slideCount: pages.length };
}

function pdfPages(pages: Buffer[], width: number, height: number): Buffer {
  const objects: Buffer[] = [], add = (value: string | Buffer) => objects.push(typeof value === "string" ? Buffer.from(value) : value);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${i * 3 + 3} 0 R`).join(" ")}] >>`);
  pages.forEach((image, i) => {
    const page = i * 3 + 3, command = `q ${width} 0 0 ${height} 0 0 cm /Image Do Q`;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Image ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(command)} >>\nstream\n${command}\nendstream`);
    add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width / 0.75 * 2} /Height 1440 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from("\nendstream")]));
  });
  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")], offsets = [0]; let offset = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    chunks.push(chunk); offset += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
