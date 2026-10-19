import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { richTextFromObject, resolvedSceneTextStyle, sceneParagraphLabels, sceneTextColor, type SceneTextRun } from "@/app/workspace/types/slideSceneText";
import { color, emu, xml } from "./pptx-elements";
function runProperties(object: SlideSceneObject, run: SceneTextRun, scale: number): string {
  const style = resolvedSceneTextStyle(object, run), opacity = (object.opacity ?? 1) * style.opacity;
  const font = style.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "") || "Arial";
  return `<a:rPr sz="${Math.round(style.fontSize * scale * 75)}" b="${style.bold ? 1 : 0}" i="${style.italic ? 1 : 0}" u="${style.underline ? "sng" : "none"}" strike="${style.strike ? "sngStrike" : "noStrike"}">` +
    `<a:solidFill><a:srgbClr val="${color(sceneTextColor(style.color), "0F172A")}"><a:alpha val="${Math.round(opacity * 100000)}"/></a:srgbClr></a:solidFill>` +
    `<a:latin typeface="${xml(font)}"/><a:ea typeface="${xml(font)}"/><a:cs typeface="${xml(font)}"/></a:rPr>`;
}
/** Every run remains editable native DrawingML; no raster text or generated HTML. */
export function exportSceneRichText(object: SlideSceneObject, id: number, scale: number): string {
  const rich = richTextFromObject(object), labels = sceneParagraphLabels(rich);
  const paragraphs = rich.paragraphs.map((p, index) => {
    const align = (p.align ?? object.align) === "center" ? "ctr" : (p.align ?? object.align) === "right" ? "r" : "l";
    const base = (object.fontSize ?? 44) * scale, level = p.level ?? 0, indent = base * 1.2;
    const list = p.bullet === "number" ? `<a:buAutoNum type="arabicPeriod" startAt="${Number.parseInt(labels[index], 10) || 1}"/>` : p.bullet === "bullet" ? '<a:buChar char="&#8226;"/>' : '<a:buNone/>';
    const props = `<a:pPr algn="${align}"${p.bullet && p.bullet !== "none" ? ` lvl="${level}" marL="${emu(indent * (level + 1))}" indent="${-emu(indent)}"` : ""}>` +
      `<a:lnSpc><a:spcPct val="${Math.round((p.lineHeight ?? 1.12) * 100000)}"/></a:lnSpc>` +
      `<a:spcBef><a:spcPts val="${Math.round((p.spaceBefore ?? 0) * scale * 75)}"/></a:spcBef><a:spcAft><a:spcPts val="${Math.round((p.spaceAfter ?? 0) * scale * 75)}"/></a:spcAft>${list}</a:pPr>`;
    const runs = p.runs.map(run => {
      const properties = runProperties(object, run, scale);
      return run.text.split("\n").map((text, i) => (i ? `<a:br>${properties}</a:br>` : "") + (text ? `<a:r>${properties}<a:t xml:space="preserve">${xml(text)}</a:t></a:r>` : "")).join("");
    }).join("");
    return `<a:p>${props}${runs}<a:endParaRPr sz="${Math.round(base * 75)}"/></a:p>`;
  }).join("");
  const anchor = object.verticalAlign === "middle" ? "ctr" : object.verticalAlign === "bottom" ? "b" : "t";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm rot="${Math.round(object.rotation * 60000)}"><a:off x="${emu(object.x * scale)}" y="${emu(object.y * scale)}"/><a:ext cx="${emu(object.w * scale)}" cy="${emu(object.h * scale)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" anchor="${anchor}" lIns="0" rIns="0" tIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
