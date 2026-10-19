import { child, elements, first, numeric, NS } from "./xml";
import { DEFAULT_THEME, type Theme } from "./model";
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
  const color = c.localName === "schemeClr" ? (theme.colors[val] || theme.colors[aliases[val]]) : c.localName === "sysClr" ? `#${c.getAttribute("lastClr") || "000000"}` : c.localName === "srgbClr" ? `#${val}` : val;
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
