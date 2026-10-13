import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";

const PNG = Buffer.alloc(3000, 1);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

async function docxWithTableAndImage(): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="${REL}"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pic.png"/></Relationships>`);
  z.file("word/media/pic.png", PNG);
  z.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>Intro line</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Owner</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Alpha</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Linh</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="p"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`);
  return z.generateAsync({ type: "nodebuffer" });
}

async function pptx(): Promise<Buffer> {
  const z = new JSZip();
  const slide = `<p:sld xmlns:a="x" xmlns:p="y" xmlns:r="r"><a:p><a:r><a:t>Slide title</a:t></a:r></a:p><a:p><a:r><a:t>Cell &amp; value</a:t></a:r></a:p><a:blip r:embed="rId2"/></p:sld>`;
  z.file("ppt/slides/slide1.xml", slide);
  z.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="rId2" Type="image" Target="../media/image1.png"/></Relationships>`);
  z.file("ppt/media/image1.png", PNG);
  z.file("ppt/notesSlides/notesSlide1.xml", `<p:notes xmlns:a="x"><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:notes>`);
  return z.generateAsync({ type: "nodebuffer" });
}

describe("embedded content in Office files", () => {
  it("keeps DOCX tables and captions embedded images", async () => {
    const describeImage = vi.fn().mockResolvedValue("diagram saying LAUNCH_CODE_9");
    const { text } = await extractTextFromBuffer(await docxWithTableAndImage(), "", "a.docx", { describeImage });
    expect(text).toContain("Item | Owner");
    expect(text).toContain("Alpha | Linh");
    expect(text).toContain("[Image: diagram saying LAUNCH_CODE_9]");
    expect(describeImage).toHaveBeenCalledTimes(1);
  });

  it("still extracts DOCX text when no describer is given or captioning fails", async () => {
    const docx = await docxWithTableAndImage();
    expect((await extractTextFromBuffer(docx, "", "a.docx")).text).toContain("Alpha | Linh");
    const failing = vi.fn().mockRejectedValue(new Error("vision down"));
    const { text } = await extractTextFromBuffer(docx, "", "a.docx", { describeImage: failing });
    expect(text).toContain("Intro line");
    expect(text).not.toContain("[Image:");
  });

  it("reads PPTX text, notes and picture captions without Python", async () => {
    const describeImage = vi.fn().mockResolvedValue("chart: revenue up");
    const { text } = await extractTextFromBuffer(await pptx(), "", "deck.pptx", { describeImage });
    expect(text).toContain("[Slide 1]");
    expect(text).toContain("Cell & value");
    expect(text).toContain("Speaker note");
    expect(text).toContain("[Image: chart: revenue up]");
  });
});
