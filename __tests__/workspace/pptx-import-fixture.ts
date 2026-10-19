import JSZip from "jszip";
import { NS, group, imageShape, tableShape, textShape, rels } from "@/lib/workspace/pptx-elements";
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
export const slideXml = (content: string, extra = "") => `<p:sld ${NS}><p:cSld name="Imported"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill></p:bgPr></p:bg><p:spTree>${group}${content}</p:spTree></p:cSld>${extra}</p:sld>`;
export async function importFixture(): Promise<JSZip> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');
  zip.file("_rels/.rels", rels([{id:"rId1",type:"officeDocument",target:"ppt/presentation.xml"}]));
  zip.file("ppt/presentation.xml", `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", rels([{id:"rId1",type:"slide",target:"slides/slide1.xml"},{id:"rId2",type:"slide",target:"slides/slide2.xml"}]));
  zip.file("ppt/slides/slide1.xml", slideXml(textShape(2,"Title & \u1ebf",120,80,700,120,24,"FFFFFF","Arial") + imageShape(3,"rIdImg","Picture",100,240,400,200,{l:0,r:0,t:25000,b:25000},30),'<p:transition><p:fade/></p:transition>'));
  zip.file("ppt/slides/_rels/slide1.xml.rels", rels([{id:"rIdImg",type:"image",target:"../media/picture.png"},{id:"rIdNote",type:"notesSlide",target:"../notesSlides/notes1.xml"}]));
  zip.file("ppt/media/picture.png", PNG, {base64:true});
  zip.file("ppt/notesSlides/notes1.xml", `<p:notes ${NS}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker notes preserved</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
  zip.file("ppt/slides/slide2.xml", slideXml(tableShape(2,[["Region","Value"],["East","42"]],60,70,800,300,"111827","2563EB","Arial")));
  return zip;
}
export const pack = (zip: JSZip) => zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
