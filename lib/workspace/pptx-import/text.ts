import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { normalizeSceneRichText, sceneRichTextPlainText, type SceneTextParagraph, type SceneTextRun, type SceneTextStyle } from "@/app/workspace/types/slideSceneText";
import { child, children, descendants, elements, first, numeric, NS } from "./xml";
import { paint, opacity } from "./paint";
import type { Theme, NoticeSink } from "./model";
const truth = (node: Element | undefined, name: string, fallback = false) => node?.hasAttribute(name) ? ["1", "true"].includes(node.getAttribute(name) ?? "") : fallback;
function runStyle(run: Element | undefined, fallback: Element | undefined, theme: Theme, scale: number, notice: NoticeSink): Required<SceneTextStyle> {
  const size = numeric(run, "sz", numeric(fallback, "sz", 2400)) / 100 * 12700 * scale;
  let font = child(run, NS.a, "latin")?.getAttribute("typeface") || child(run, NS.a, "ea")?.getAttribute("typeface") || child(fallback, NS.a, "latin")?.getAttribute("typeface") || theme.minorFont;
  if (font.startsWith("+mj")) font = theme.majorFont; if (font.startsWith("+mn")) font = theme.minorFont;
  if (!/^[\w\s,'"-]{1,100}$/.test(font)) { notice("font-family", "An unsupported font name was replaced with Arial."); font = "Arial"; }
  const u = run?.getAttribute("u") ?? fallback?.getAttribute("u"), strike = run?.getAttribute("strike") ?? fallback?.getAttribute("strike");
  if (u && !["none", "sng"].includes(u)) notice("text-underline", "A custom underline style was normalized to a single underline.");
  if (strike && !["noStrike", "sngStrike"].includes(strike)) notice("text-strike", "A custom strike style was normalized to a single strikethrough.");
  if (size < 8 || size > 180) notice("font-size", "A text run was fitted to the supported 8-180 scene-pixel range.");
  if (numeric(run, "baseline") || numeric(run, "spc") || run?.getAttribute("cap") && run.getAttribute("cap") !== "none") notice("text-special", "Baseline, character spacing or capitalization effects require visual review; characters are retained.");
  if (child(run, NS.a, "hlinkClick") || child(run, NS.a, "hlinkMouseOver")) notice("text-link", "A text hyperlink was retained as text formatting, not an activated action.");
  return { bold: truth(run, "b", truth(fallback, "b")), italic: truth(run, "i", truth(fallback, "i")), underline: !!u && u !== "none", strike: !!strike && strike !== "noStrike",
    fontSize: Math.max(8, Math.min(180, size)), fontFamily: font, color: paint(run, theme, paint(fallback, theme, "#0f172a")),
    opacity: opacity(child(run, NS.a, "solidFill") ? run : fallback) };
}
function spacing(p: Element | undefined, name: string, font: number, scale: number, fallback: number, notice: NoticeSink): number {
  const holder = child(p, NS.a, name); if (!holder) return fallback;
  const percent = child(holder, NS.a, "spcPct"), points = child(holder, NS.a, "spcPts");
  const value = percent ? numeric(percent, "val") / 100000 * font : points ? numeric(points, "val") / 100 * 12700 * scale : fallback;
  if (!Number.isFinite(value) || value < 0 || value > 300) notice("text-spacing", "A paragraph spacing value was fitted to the supported range.");
  return Math.max(0, Math.min(300, Number.isFinite(value) ? value : fallback));
}
/** Parse each native run/paragraph rather than collapsing a text box into its first run's style. */
export function readText(body: Element, theme: Theme, scale: number, notice: NoticeSink): Partial<SlideSceneObject> {
  const source = children(body, NS.a, "p"), paragraphs: SceneTextParagraph[] = [];
  const defaults = first(body, NS.a, "defRPr"), initial = runStyle(first(body, NS.a, "rPr"), defaults, theme, scale, notice);
  let count = 0;
  for (const p of source) {
    const props = child(p, NS.a, "pPr"), level = Math.max(0, Math.min(8, numeric(props, "lvl")));
    const inherited = child(props, NS.a, "defRPr") || child(child(child(body, NS.a, "lstStyle"), NS.a, `lvl${level + 1}pPr`), NS.a, "defRPr") || defaults;
    const runs: SceneTextRun[] = [];
    for (const node of elements(p)) {
      if (node.namespaceURI !== NS.a || !["r", "fld", "br"].includes(node.localName)) continue;
      const text = node.localName === "br" ? "\n" : children(node, NS.a, "t").map(t => t.textContent ?? "").join("");
      count += text.length; if (count > 10000) throw new Error("An imported text box exceeds 10,000 characters");
      runs.push({ text, ...runStyle(child(node, NS.a, "rPr"), inherited, theme, scale, notice) });
      if (node.localName === "fld") notice("text-field", "A dynamic text field was imported using its cached displayed text.");
    }
    const size = Math.max(initial.fontSize, ...runs.map(run => run.fontSize ?? initial.fontSize));
    const lineHolder = child(props, NS.a, "lnSpc"), percent = child(lineHolder, NS.a, "spcPct"), points = child(lineHolder, NS.a, "spcPts");
    let lineHeight = percent ? numeric(percent, "val", 112000) / 100000 : points ? numeric(points, "val") / 100 * 12700 * scale / size : 1.12;
    if (lineHeight < 0.8 || lineHeight > 3) { notice("text-line-spacing", "A paragraph line height was fitted to the supported 0.8-3 range."); lineHeight = Math.max(0.8, Math.min(3, lineHeight)); }
    const align = props?.getAttribute("algn"), bullet = child(props, NS.a, "buChar"), numbered = child(props, NS.a, "buAutoNum");
    if (align && !["l", "ctr", "r"].includes(align)) notice("text-alignment", "A justified/distributed paragraph was imported with left alignment.");
    if (bullet && !["\u2022", "\u00b7"].includes(bullet.getAttribute("char") ?? "")) notice("bullet-character", "A custom bullet character was normalized to the editable round bullet.");
    if (numbered && numbered.getAttribute("type") !== "arabicPeriod") notice("list-format", "A custom number-list style was normalized to decimal numbering.");
    const start = numbered?.hasAttribute("startAt") ? Math.max(1, Math.min(9999, numeric(numbered, "startAt", 1))) : undefined;
    paragraphs.push({ runs: runs.length ? runs : [{ text: "" }], align: align === "ctr" ? "center" : align === "r" ? "right" : "left", lineHeight,
      spaceBefore: spacing(props, "spcBef", size, scale, 0, notice), spaceAfter: spacing(props, "spcAft", size, scale, 0, notice),
      ...(bullet || numbered ? { bullet: numbered ? "number" : "bullet", level, ...(start !== undefined ? { start } : {}) } : {}) });
  }
  const allRuns = paragraphs.flatMap(p => p.runs).filter(run => run.text.length), alphas = new Set(allRuns.map(run => run.opacity ?? 1));
  const commonOpacity = alphas.size === 1 ? allRuns[0]?.opacity ?? 1 : 1;
  const base: Required<SceneTextStyle> = {
    ...initial,
    bold: allRuns.length > 0 && allRuns.every(run => run.bold),
    italic: allRuns.length > 0 && allRuns.every(run => run.italic),
    underline: allRuns.length > 0 && allRuns.every(run => run.underline),
    strike: allRuns.length > 0 && allRuns.every(run => run.strike),
    opacity: commonOpacity,
  };
  for (const p of paragraphs) for (const run of p.runs) {
    if (alphas.size <= 1) delete run.opacity;
    for (const key of ["bold", "italic", "underline", "strike", "fontSize", "fontFamily", "color"] as const) if (run[key] === base[key]) delete run[key];
  }
  const richText = normalizeSceneRichText({ version: 1, paragraphs: paragraphs.length ? paragraphs : [{ runs: [{ text: "" }] }] });
  if (!richText) throw new Error("Imported rich text exceeds supported paragraph/run limits or contains invalid formatting.");
  const bp = child(body, NS.a, "bodyPr"), anchor = bp?.getAttribute("anchor");
  if (bp?.getAttribute("vert") && bp.getAttribute("vert") !== "horz") notice("text-direction", "Vertical text direction was imported as horizontal text.");
  if (descendants(body, NS.a, "tabLst").length) notice("text-tabs", "Custom tab stops require visual review after import.");
  return { text: sceneRichTextPlainText(richText), richText, fontSize: base.fontSize, fontFamily: base.fontFamily,
    fontWeight: base.bold ? "bold" : "normal", italic: base.italic, underline: base.underline, strike: base.strike,
    color: base.color, opacity: commonOpacity, align: richText.paragraphs[0].align ?? "left", verticalAlign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top" };
}
