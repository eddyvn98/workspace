import { describe, expect, it } from "vitest";
import { normalizeSlideScene, scenePatchObject, type SlideSceneObject } from "@/app/workspace/types/slideScene";
import { normalizeSceneRichText, richTextFromObject, resolvedSceneTextStyle, sceneParagraphLabels, sceneRichTextPlainText, type SceneRichText } from "@/app/workspace/types/slideSceneText";
import { sceneTextFromEditor, sceneTextToEditor } from "@/app/workspace/utils/slideSceneTextCodec";
import { resizeSceneSelection } from "@/app/workspace/utils/slideSceneGroupTransform";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
const rich: SceneRichText = { version: 1, paragraphs: [
  { runs: [{ text: "Xin chào ", bold: false }, { text: "Việt Nam", bold: true, color: "#CC3300", fontSize: 60, italic: true, underline: true }], align: "center", lineHeight: 1.3, spaceAfter: 12 },
  { runs: [{ text: "Mục đầu", strike: true }], bullet: "number", start: 3 },
  { runs: [{ text: "Dòng tiếp\nxuống hàng" }], bullet: "number" },
] };
const object: SlideSceneObject = { id: "text", kind: "text", x: 100, y: 80, w: 600, h: 300, rotation: 15,
  fontSize: 40, fontFamily: "Arial", fontWeight: "bold", color: "#112233", richText: rich, text: "stale cache", verticalAlign: "middle" };
function scene() { return normalizeSlideScene({ version: 2, objects: [object] })!; }
describe("Scene V2 structured rich text", () => {
  it("preserves Unicode, explicit false styles, lists and an authoritative text cache", () => {
    const normalized = scene().objects[0];
    expect(normalized.richText).toBeDefined();
    expect(normalized.text).toBe("Xin chào Việt Nam\n3. Mục đầu\n4. Dòng tiếp\nxuống hàng");
    expect(normalized.richText!.paragraphs[0].runs[0].bold).toBe(false);
    expect(resolvedSceneTextStyle(normalized, normalized.richText!.paragraphs[0].runs[0]).bold).toBe(false);
    expect(normalized.verticalAlign).toBe("middle");
    expect(sceneParagraphLabels(normalized.richText!)).toEqual(["", "3.", "4."]);
  });
  it("rejects malformed or oversized style data instead of truncating rich text", () => {
    expect(normalizeSceneRichText({ version: 2, paragraphs: [] })).toBeUndefined();
    expect(normalizeSceneRichText({ version: 1, paragraphs: [{ runs: [{ text: "Bad", color: "url(javascript:bad)" }] }] })).toBeUndefined();
    expect(normalizeSceneRichText({ version: 1, paragraphs: [{ runs: [{ text: "Bad", bold: "false" }] }] })).toBeUndefined();
    expect(normalizeSceneRichText({ version: 1, paragraphs: [{ runs: [{ text: "Bad", fontSize: Infinity }] }] })).toBeUndefined();
    expect(normalizeSceneRichText({ version: 1, paragraphs: [{ runs: [{ text: "a".repeat(10001) }] }] })).toBeUndefined();
    expect(normalizeSceneRichText({ version: 1, paragraphs: Array.from({ length: 201 }, () => ({ runs: [] })) })).toBeUndefined();
  });
  it("keeps rich formatting through geometric patches", () => {
    const before = scene(), after = scenePatchObject(before, "text", { x: 200, rotation: 45 });
    expect(after.objects[0].richText).toEqual(before.objects[0].richText);
    expect(after.objects[0].text).toEqual(before.objects[0].text);
    expect(after.objects[0].x).toBe(200);
  });
  it("whole-box formatting clears only matching run overrides", () => {
    const after = scenePatchObject(scene(), "text", { fontWeight: "normal", fontSize: 32, color: "#006699", align: "right" }).objects[0];
    for (const p of after.richText!.paragraphs) {
      expect(p.align).toBeUndefined();
      for (const run of p.runs) {
        expect(run.bold).toBeUndefined(); expect(run.fontSize).toBeUndefined(); expect(run.color).toBeUndefined();
        expect(resolvedSceneTextStyle(after, run)).toMatchObject({ bold: false, fontSize: 32, color: "#006699" });
      }
    }
    expect(after.richText!.paragraphs[0].runs.some(run => run.italic && run.underline)).toBe(true);
  });
  it("keeps rich text on no-op text patches and explicitly replaces it on plain-text rewrite", () => {
    const before = scene();
    expect(scenePatchObject(before, "text", { text: before.objects[0].text }).objects[0].richText).toEqual(before.objects[0].richText);
    const rewritten = scenePatchObject(before, "text", { text: "A new plain title" }).objects[0];
    expect(rewritten.text).toBe("A new plain title"); expect(rewritten.richText).toBeUndefined();
  });
  it("scales explicit run sizes and paragraph gaps with group transforms", () => {
    const scaled = resizeSceneSelection(scene(), ["text"], { x: 100, y: 80, w: 1200, h: 600 }).objects[0];
    expect(scaled.fontSize).toBe(80);
    expect(scaled.richText!.paragraphs[0].runs[1].fontSize).toBe(120);
    expect(scaled.richText!.paragraphs[0].spaceAfter).toBe(24);
    expect(scaled.text).toEqual(scene().objects[0].text);
  });
  it("roundtrips editable documents including lists, hard breaks and overridden normal weight", () => {
    const before = scene().objects[0], model = before.richText!;
    const result = sceneTextFromEditor(sceneTextToEditor(model, before), before)!;
    expect(sceneRichTextPlainText(result)).toBe(before.text);
    expect(result.paragraphs[0].runs.map(run => resolvedSceneTextStyle(before, run)))
      .toEqual(model.paragraphs[0].runs.map(run => resolvedSceneTextStyle(before, run)));
    expect(result.paragraphs[1].start).toBe(3);
    expect(result.paragraphs[2].runs.map(run => run.text).join("")).toBe("Dòng tiếp\nxuống hàng");
  });
  it("keeps legacy text boxes usable without migration", () => {
    expect(sceneRichTextPlainText(richTextFromObject({ text: "Legacy\ncontent" }))).toBe("Legacy\ncontent");
    expect(resolvedSceneTextStyle({ fontWeight: "bold" }, { bold: false })).toMatchObject({ bold: false, opacity: 1 });
  });
  it("authors rich text using the same SDK without executing external code", () => {
    const deck = createSlideScript("Rich text");
    deck.slide("Content", slide => {
      const id = slide.richText(rich, { x: 50, y: 60, w: 1100, h: 600 }, { fontSize: 40, fontWeight: "bold" });
      slide.motion(id, { kind: "fade", trigger: "on-click" });
    });
    const created = deck.build().action.slides[0].scene.objects[0];
    expect(created.richText!.paragraphs[0].runs.some(run => run.underline)).toBe(true);
    expect(created.motion?.trigger).toBe("on-click");
  });
});
