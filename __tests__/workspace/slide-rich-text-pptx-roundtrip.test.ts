// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeSlideScene, type SlideSceneObject } from "@/app/workspace/types/slideScene";
import { resolvedSceneTextStyle, sceneRichTextPlainText } from "@/app/workspace/types/slideSceneText";
import { exportSceneShape } from "@/lib/workspace/pptx-scene";
import { pdfSceneRichText } from "@/lib/workspace/pdf-scene-text";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const source: SlideSceneObject = {
  id: "rich", kind: "text", x: 80, y: 90, w: 1000, h: 450, rotation: 20,
  fontSize: 40, fontFamily: "Arial", fontWeight: "bold", color: "#224466", opacity: 0.8, verticalAlign: "middle",
  richText: { version: 1, paragraphs: [
    { align: "center", lineHeight: 1.4, spaceAfter: 14, runs: [{ text: "Xin chào ", bold: false }, { text: "Việt Nam", color: "#BB3300", italic: true, underline: true, fontSize: 60 }] },
    { bullet: "number", start: 3, level: 1, runs: [{ text: "First numbered" }] },
    { bullet: "number", level: 1, runs: [{ text: "Next\nline", strike: true, opacity: 0.5 }] },
  ] },
};
const normalized = () => normalizeSlideScene({ version: 2, objects: [source] })!.objects[0];
async function reimport(object: SlideSceneObject) {
  const zip = await importFixture();
  zip.file("ppt/slides/slide1.xml", slideXml(exportSceneShape(object, 2, 1)));
  return parsePptx(await pack(zip), "rich-text.pptx");
}
describe("Rich text PowerPoint and PDF integration", () => {
  it("writes editable native runs and paragraphs with point-based font sizes", () => {
    const xml = exportSceneShape(normalized(), 2, 1);
    expect(xml).toContain('name="Text 2"');
    expect(xml).toContain('sz="3000"'); expect(xml).toContain('sz="4500"');
    expect(xml).toContain('b="0"'); expect(xml).toContain('i="1"'); expect(xml).toContain('u="sng"');
    expect(xml).toContain('strike="sngStrike"'); expect(xml).toContain('anchor="ctr"');
    expect(xml).toContain('<a:spcPct val="140000"/>'); expect(xml).toContain('<a:spcPts val="1050"/>');
    expect(xml).toContain('<a:buAutoNum type="arabicPeriod" startAt="3"/>');
    expect(xml).toContain('<a:buAutoNum type="arabicPeriod" startAt="4"/>');
    expect(xml).toContain('<a:br>'); expect(xml).not.toContain('<p:pic>');
  });
  it("reimports Unicode and individual styles without a mixed-run downgrade notice", async () => {
    const before = normalized(), result = await reimport(before), after = result.slides[0].scene!.objects.find(o => o.kind === "text")!;
    expect(after.text).toBe(before.text); expect(after.rotation).toBeCloseTo(20);
    expect(after.verticalAlign).toBe("middle"); expect(after.richText).toBeDefined();
    const first = after.richText!.paragraphs[0], old = before.richText!.paragraphs[0];
    expect(first.align).toBe("center"); expect(first.lineHeight).toBeCloseTo(1.4); expect(first.spaceAfter).toBeCloseTo(14);
    expect(resolvedSceneTextStyle(after, first.runs[0]).bold).toBe(false);
    const a = resolvedSceneTextStyle(after, first.runs[1]), b = resolvedSceneTextStyle(before, old.runs[1]);
    expect(a.fontSize).toBeCloseTo(b.fontSize); expect(a.color.toUpperCase()).toBe(b.color.toUpperCase());
    expect(a.italic).toBe(true); expect(a.underline).toBe(true);
    expect(result.notices.some(n => n.code === "text-style" || n.code === "text-anchor")).toBe(false);
  });
  it("preserves effective alpha when different runs have different opacity", async () => {
    const before = normalized(), after = (await reimport(before)).slides[0].scene!.objects.find(o => o.kind === "text")!;
    const oldRuns = before.richText!.paragraphs[2].runs, newRuns = after.richText!.paragraphs[2].runs;
    expect(sceneRichTextPlainText(after.richText!)).toBe(before.text);
    for (const run of newRuns.filter(run => run.text.trim())) {
      expect((after.opacity ?? 1) * resolvedSceneTextStyle(after, run).opacity)
        .toBeCloseTo((before.opacity ?? 1) * resolvedSceneTextStyle(before, oldRuns[0]).opacity);
    }
  });
  it("keeps legacy plain objects exportable through the same native text serializer", async () => {
    const plain: SlideSceneObject = { ...source, richText: undefined, text: "Plain\nlegacy", fontWeight: "normal", verticalAlign: "bottom", italic: true };
    const after = (await reimport(plain)).slides[0].scene!.objects.find(o => o.kind === "text")!;
    expect(after.text).toBe("Plain\nlegacy"); expect(after.italic).toBe(true); expect(after.verticalAlign).toBe("bottom");
    expect(after.fontSize).toBeCloseTo(40);
  });
  it("renders styled spans and list labels in server-side PDF SVG", () => {
    const svg = pdfSceneRichText(normalized());
    expect(svg).toContain('font-style="italic"'); expect(svg).toContain('text-decoration="underline"');
    expect(svg).toContain('fill="#BB3300"'); expect(svg).toContain('font-size="60"');
    expect(svg).toContain('>3.</text>'); expect(svg).toContain('>4.</text>');
    expect(svg).toContain('opacity="0.5"'); expect(svg).not.toContain("<script");
  });
});
