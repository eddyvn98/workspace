/**
 * pnpm exec tsx docs/examples/slide-rich-text-vectors.ts > rich-text-vector-deck.json
 * Output is { action, warnings }. It does not mutate a board, authenticate, or execute a generated script.
 * The host app can validate and dispatch output.action through its existing Workspace command executor.
 */
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
import type { SceneShapeKind } from "@/app/workspace/types/slideSceneShape";

const deck = createSlideScript("Editable typography and vectors");
const colors = { paper: "#F4F1EA", ink: "#18242C", accent: "#BB4B32", muted: "#5B6B74" };
deck.slide("Typography", slide => {
  slide.background(colors.paper).transition("fade");
  slide.shape(colors.accent, { x: 1155, y: 70, w: 14, h: 555 });
  const title = slide.richText({ version: 1, paragraphs: [
    { runs: [{ text: "One text box. ", bold: true }, { text: "More expression.", bold: false, italic: true, color: colors.accent }], lineHeight: 1.08 },
    { runs: [{ text: "Nội dung tiếng Việt vẫn chỉnh sửa được.", fontSize: 30, color: colors.muted }], spaceBefore: 22 },
  ] }, { x: 85, y: 100, w: 1000, h: 280 }, { fontSize: 64, color: colors.ink, fontFamily: "Georgia" });
  slide.richText({ version: 1, paragraphs: [
    { bullet: "number", runs: [{ text: "Edit selected words", bold: true }, { text: " without flattening the whole paragraph." }], spaceAfter: 20 },
    { bullet: "number", runs: [{ text: "Keep ", bold: false }, { text: "colors and emphasis", underline: true, color: colors.accent }, { text: " in editable PowerPoint runs." }], spaceAfter: 20 },
    { bullet: "number", runs: [{ text: "Resize the composition while preserving relative typography." }] },
  ] }, { x: 95, y: 420, w: 980, h: 230 }, { fontSize: 30, color: colors.ink });
  slide.motion(title, { kind: "fade", trigger: "on-click", durationMs: 500 });
  slide.notes("Example data only. Format selected text opens a draft editor; Apply creates one scene-history change. Export and reimport to inspect styled runs.");
});

deck.slide("Editable vector geometry", slide => {
  slide.background("#FFFFFF").transition("wipe");
  slide.richText({ version: 1, paragraphs: [{ runs: [{ text: "Presets ", bold: true }, { text: "+ a custom path", color: colors.accent, italic: true }] }] },
    { x: 80, y: 65, w: 1100, h: 110 }, { fontSize: 54, color: colors.ink });
  const kinds: SceneShapeKind[] = ["ellipse", "hexagon", "rightArrow", "star5", "heart"];
  kinds.forEach((shapeKind, index) => {
    const x = 85 + index * 230;
    slide.shape(index % 2 ? "#E8DDD1" : "#BED7D8", { x, y: 220, w: 150, h: 125 }, { shapeKind, stroke: colors.ink, strokeWidth: 2 });
    slide.text(shapeKind, { x: x - 15, y: 365, w: 180, h: 50 }, { fontSize: 24, align: "center", color: colors.muted });
  });
  slide.vector({ width: 1000, height: 300, commands: [
    { type: "M", x: 0, y: 220 },
    { type: "C", x1: 220, y1: 20, x2: 420, y2: 280, x: 600, y: 120 },
    { type: "Q", x1: 840, y1: 10, x: 1000, y: 150 },
    { type: "L", x: 1000, y: 300 }, { type: "L", x: 0, y: 300 }, { type: "Z" },
  ] }, { x: 85, y: 465, w: 1090, h: 180 }, colors.accent, { stroke: colors.ink, strokeWidth: 2 });
  slide.notes("All shapes are editable data, not an image background. Custom M/L/C/Q/Z paths export as DrawingML custom geometry. Preset adjustment formulas outside the supported subset are reported during import.");
});

process.stdout.write(JSON.stringify(deck.build(), null, 2) + "\n");
