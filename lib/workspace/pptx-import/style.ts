import { child, children, descendants, elements, first, numeric, NS } from "./xml";
import { DEFAULT_THEME, type Theme, type NoticeSink } from "./model";
import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
export function readTheme(document: Document | null): Theme {
  const colors = { ...DEFAULT_THEME.colors };
  for (const e of elements(first(document, NS.a, "clrScheme"))) {
    const value = elements(e)[0];
    const hex = value?.localName === "sysClr" ? value.getAttribute("lastClr") : value?.getAttribute("val");
    if (hex && /^[a-f0-9]{6}$/i.test(hex)) colors[e.localName] = `#${hex}`;
  }
  return { colors, majorFont: first(first(document,NS.a,"majorFont"),NS.a,"latin")?.getAttribute("typeface") || "Arial", minorFont: first(first(document,NS.a,"minorFont"),NS.a,"latin")?.getAttribute("typeface") || "Arial" };
}
export function paint(node: Element | undefined, theme: Theme, fallback: string): string {
  if (!node) return fallback;
  if (child(node, NS.a, "noFill")) return "transparent";
  const fill = child(node, NS.a, "solidFill") || node;
  const c = elements(fill).find(e => e.namespaceURI === NS.a && ["srgbClr","schemeClr","sysClr","prstClr"].includes(e.localName));
  if (!c) return fallback;
  const aliases: Record<string,string> = { bg1:"lt1",bg2:"lt2",tx1:"dk1",tx2:"dk2" };
  const val = c.getAttribute("val") || "";
  let color = c.localName === "schemeClr" ? (theme.colors[val] || theme.colors[aliases[val]]) : c.localName === "sysClr" ? `#${c.getAttribute("lastClr") || "000000"}` : c.localName === "srgbClr" ? `#${val}` : val;
  if (!color || !/^#[a-f0-9]{6}$/i.test(color)) return fallback;
  let rgb = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  for (const effect of elements(c)) {
    const amount = Math.max(0,Math.min(1,numeric(effect,"val")/100000));
    if (effect.localName === "tint") rgb = rgb.map(v=>v+(255-v)*(1-amount));
    if (effect.localName === "shade" || effect.localName === "lumMod") rgb = rgb.map(v=>v*amount);
    if (effect.localName === "lumOff") rgb = rgb.map(v=>v+255*amount);
  }
  return "#"+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}
export function opacity(node: Element | undefined): number {
  return Math.max(0,Math.min(1,numeric(first(child(node,NS.a,"solidFill"),NS.a,"alpha"),"val",100000)/100000));
}
export function readText(body: Element, theme: Theme, scale: number, notice: NoticeSink): Partial<SlideSceneObject> {
  const paragraphs = children(body,NS.a,"p");
  const lines = paragraphs.map(p=>{
    let text="";
    for (const e of elements(p)) {
      if (e.localName === "br" && e.namespaceURI === NS.a) text += "\n";
      else if (["r","fld"].includes(e.localName) && e.namespaceURI === NS.a) text += children(e,NS.a,"t").map(t=>t.textContent || "").join("");
    }
    const pr=child(p,NS.a,"pPr"), bullet=child(pr,NS.a,"buChar"), numbered=child(pr,NS.a,"buAutoNum");
    if (numbered) notice("list-format", "Automatic list numbering was converted to plain bullets; review list numbering.");
    return (bullet ? `${bullet.getAttribute("char") || "\u2022"} ` : numbered ? "\u2022 " : "")+text;
  });
  const text = lines.join("\n");
  if (text.length > 10000) throw new Error("An imported text box exceeds 10,000 characters");
  const run = first(body,NS.a,"rPr"), defaults = first(body,NS.a,"defRPr");
  const size = numeric(run,"sz",numeric(defaults,"sz",2400))/100*12700*scale;
  let font = first(run,NS.a,"latin")?.getAttribute("typeface") || first(defaults,NS.a,"latin")?.getAttribute("typeface") || theme.minorFont;
  if (font.startsWith("+mj")) font=theme.majorFont;
  if (font.startsWith("+mn")) font=theme.minorFont;
  if (!/^[\w\s,'"-]{1,100}$/.test(font)) { notice("font-family", "An unsupported font name was replaced with Arial."); font="Arial"; }
  const align = child(paragraphs[0],NS.a,"pPr")?.getAttribute("algn");
  const signatures = new Set(descendants(body,NS.a,"rPr").map(e => `${e.getAttribute("sz")}|${e.getAttribute("b")}|${e.getAttribute("i")}|${paint(e,theme,"")}`));
  if (signatures.size > 1 || descendants(body,NS.a,"hlinkClick").length || run?.getAttribute("i")==="1" || run?.hasAttribute("u")) notice("text-style", "Text is preserved; mixed run formatting, italics, underlines and hyperlinks need review.");
  if (size < 8 || size > 180) notice("font-size", "A font size was limited to the editable range (8-180 px).");
  return { text, fontSize:Math.max(8,Math.min(180,size)), fontFamily:font, fontWeight:(run?.getAttribute("b") || defaults?.getAttribute("b"))==="1"?"bold":"normal", color:paint(run,theme,paint(defaults,theme,"#0f172a")), opacity:opacity(run || defaults), align:align==="ctr"?"center":align==="r"?"right":"left" };
}
