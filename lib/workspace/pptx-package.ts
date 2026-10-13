import type JSZip from "jszip";
import { emu, group, NS, rels, textShape, xml } from "./pptx-elements";

const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const theme = `${declaration}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Workspace"><a:themeElements><a:clrScheme name="Workspace">${["dk1:000000", "lt1:FFFFFF", "dk2:1F2937", "lt2:F1F5F9", "accent1:2563EB", "accent2:16A34A", "accent3:D97706", "accent4:DC2626", "accent5:7C3AED", "accent6:0891B2", "hlink:2563EB", "folHlink:7C3AED"].map((v) => { const [name, value] = v.split(":"); return `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`; }).join("")}</a:clrScheme><a:fontScheme name="Workspace"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Workspace"><a:fillStyleLst>${Array.from({ length: 3 }, () => '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join("")}</a:fillStyleLst><a:lnStyleLst>${Array.from({ length: 3 }, () => '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>').join("")}</a:lnStyleLst><a:effectStyleLst>${Array.from({ length: 3 }, () => '<a:effectStyle><a:effectLst/></a:effectStyle>').join("")}</a:effectStyleLst><a:bgFillStyleLst>${Array.from({ length: 3 }, () => '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join("")}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const colorMap = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';

export function addPptxPackage(zip: JSZip, count: number, width: number, chartCount: number, title: string) {
  const overrides: [string, string][] = [
    ["presentation.xml", "presentation.main"], ["slideMasters/slideMaster1.xml", "slideMaster"],
    ["slideLayouts/slideLayout1.xml", "slideLayout"], ["notesMasters/notesMaster1.xml", "notesMaster"],
  ];
  for (let i = 1; i <= count; i++) overrides.push([`slides/slide${i}.xml`, "slide"], [`notesSlides/notesSlide${i}.xml`, "notesSlide"]);
  const contentTypes = overrides.map(([path, type]) => `<Override PartName="/ppt/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`).join("");
  zip.file("[Content_Types].xml", `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>${contentTypes}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${Array.from({ length: chartCount }, (_, i) => `<Override PartName="/ppt/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", rels([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }]));
  zip.file("ppt/presentation.xml", `${declaration}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${emu(width)}" cy="${emu(720)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", rels([
    { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: "notesMaster", target: "notesMasters/notesMaster1.xml" },
    ...Array.from({ length: count }, (_, i) => ({ id: `rId${i + 3}`, type: "slide", target: `slides/slide${i + 1}.xml` })),
  ]));
  zip.file("ppt/theme/theme1.xml", theme);
  zip.file("ppt/slideMasters/slideMaster1.xml", `${declaration}<p:sldMaster ${NS}><p:cSld name="${xml(title)}"><p:spTree>${group}</p:spTree></p:cSld>${colorMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: "theme", target: "../theme/theme1.xml" }]));
  zip.file("ppt/slideLayouts/slideLayout1.xml", `${declaration}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]));
  zip.file("ppt/notesMasters/notesMaster1.xml", `${declaration}<p:notesMaster ${NS}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colorMap}<p:notesStyle/></p:notesMaster>`);
  zip.file("ppt/notesMasters/_rels/notesMaster1.xml.rels", rels([{ id: "rId1", type: "theme", target: "../theme/theme1.xml" }]));
}

export function addPptxNotes(zip: JSZip, index: number, notes: string) {
  const shape = textShape(2, notes, 40, 40, 640, 880, 14, "111827", "Arial").replace('<p:cNvSpPr txBox="1"/><p:nvPr/>', '<p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr>');
  zip.file(`ppt/notesSlides/notesSlide${index}.xml`, `${declaration}<p:notes ${NS}><p:cSld><p:spTree>${group}${shape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
  zip.file(`ppt/notesSlides/_rels/notesSlide${index}.xml.rels`, rels([{ id: "rId1", type: "notesMaster", target: "../notesMasters/notesMaster1.xml" }, { id: "rId2", type: "slide", target: `../slides/slide${index}.xml` }]));
}
