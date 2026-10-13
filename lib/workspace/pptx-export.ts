import JSZip from "jszip";
import { boardExportSlides } from "./slide-export-scene";
import { chartShape, group, imageShape, NS, rels, tableShape, textShape, xml } from "./pptx-elements";
import { addPptxChart } from "./pptx-chart";
import { addPptxNotes, addPptxPackage } from "./pptx-package";
import { slideExportImages, type SlideImageReader } from "./slide-export-images";
import { slideExportLayout } from "./slide-export-layout";
import { slideExportStyle } from "./slide-export-style";

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Rebuilds rich-text slides as editable PowerPoint objects; images use stored workspace uploads only. */
export async function exportBoardPptx(
  board: { title: string; blocks: unknown; blockOrder: unknown }, ids: unknown, readImage: SlideImageReader,
) {
  const slides = boardExportSlides(board, ids), width = slides[0].width;
  const zip = new JSZip(), loadImage = slideExportImages(readImage), style = slideExportStyle();
  let chartCount = 0;
  for (const [i, entry] of slides.entries()) {
    const { slide, theme, elements } = entry;
    const { contentWidth, heights, scale } = slideExportLayout(elements, width, i);
    const relationships = [{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: "notesSlide", target: `../notesSlides/notesSlide${i + 1}.xml` }];
    const { fill, accent, font, background } = await style(slide, theme);
    const shapes: string[] = []; let y = 48;
    for (const [j, element] of elements.entries()) {
      const height = heights[j] * scale, id = j + 2;
      if (element.kind === "text") shapes.push(textShape(id, element.text, 56, y, contentWidth, height, (element.heading ? 32 : 20) * scale, fill, font, element.heading));
      if (element.kind === "table") shapes.push(tableShape(id, element.rows, 56, y, contentWidth, height, "111827", accent, font));
      if (element.kind === "image") {
        const image = await loadImage(element.src), relId = `rId${relationships.length + 1}`;
        zip.file(`ppt/media/image${image.index}.png`, image.buffer);
        relationships.push({ id: relId, type: "image", target: `../media/image${image.index}.png` });
        const ratio = Math.min(contentWidth / image.width, height / image.height), w = image.width * ratio, h = image.height * ratio;
        shapes.push(imageShape(id, relId, element.alt, 56 + (contentWidth - w) / 2, y + (height - h) / 2, w, h));
      }
      if (element.kind === "chart") {
        const index = ++chartCount, relId = `rId${relationships.length + 1}`;
        await addPptxChart(zip, index, element.series, accent);
        relationships.push({ id: relId, type: "chart", target: `../charts/chart${index}.xml` });
        shapes.push(chartShape(id, relId, 56, y, contentWidth, height));
      }
      y += height + 14 * scale;
    }
    const transition = slide.transition === "fade" ? '<p:fade/>' : slide.transition === "slide" ? '<p:push dir="l"/>' : slide.transition === "zoom" ? '<p:zoom dir="in"/>' : "";
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld name="${xml(slide.name)}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transition ? `<p:transition spd="med">${transition}</p:transition>` : ""}</p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels(relationships));
    addPptxNotes(zip, i + 1, slide.presenterNotes ?? "");
  }
  addPptxPackage(zip, slides.length, width, chartCount, board.title);
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), slideCount: slides.length };
}
