// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeSlideScene, type SlideSceneObject } from "@/app/workspace/types/slideScene";
import { SCENE_SHAPES, normalizeSceneVectorPath, type SceneVectorPath } from "@/app/workspace/types/slideSceneShape";
import { sceneShapePath } from "@/app/workspace/utils/slideSceneShapePath";
import { exportSceneShape } from "@/lib/workspace/pptx-scene";
import { readSceneShape } from "@/lib/workspace/pptx-import/shape";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const path: SceneVectorPath = { width: 100, height: 100, commands: [
  { type: "M", x: 0, y: 80 }, { type: "C", x1: 20, y1: 0, x2: 80, y2: 100, x: 100, y: 20 },
  { type: "L", x: 100, y: 100 }, { type: "L", x: 0, y: 100 }, { type: "Z" },
] };
const base: SlideSceneObject = { id: "shape", kind: "shape", x: 80, y: 100, w: 200, h: 120, rotation: 25, fill: "#336699", stroke: "#112233", strokeWidth: 3, strokeDash: "dash" };
const normalize = (extra: Partial<SlideSceneObject>) => normalizeSlideScene({ version: 2, objects: [{ ...base, ...extra }] })!.objects[0];
const props = (xml: string) => new DOMParser().parseFromString(slideXml(xml), "application/xml").getElementsByTagNameNS("http://schemas.openxmlformats.org/presentationml/2006/main", "spPr")[0];
describe("Slide vector geometry", () => {
  it.each(SCENE_SHAPES.filter(kind => kind !== "custom"))("keeps %s as an editable preset instead of a rectangle fallback", kind => {
    const object = normalize({ shapeKind: kind });
    expect(object.shapeKind).toBe(kind);
    expect(sceneShapePath(object)).not.toMatch(/NaN|undefined/);
    expect(exportSceneShape(object, 2, 1)).toContain(`prst="${kind}"`);
    const notices: string[] = [];
    const imported = readSceneShape(props(exportSceneShape(object, 2, 1)), base, 1 / 9525, code => notices.push(code));
    expect(imported.shapeKind).toBe(kind);
    expect(notices).not.toContain("shape-geometry");
  });
  it("supports old radius-only shapes and explicit rounded-preset defaults", () => {
    expect(normalize({ radius: 24 }).shapeKind).toBe("roundRect");
    expect(normalize({ shapeKind: "roundRect" }).radius).toBeGreaterThan(0);
    expect(normalize({ shapeKind: "roundRect", radius: 0 }).radius).toBe(0);
  });
  it("retains bounded custom path commands and scales their local viewBox", () => {
    const object = normalize({ shapeKind: "custom", shapePath: path });
    expect(object.shapePath).toEqual(path);
    expect(sceneShapePath(object)).toContain("C40 0 160 120 200 24");
    const exported = exportSceneShape(object, 2, 1);
    expect(exported).toContain("<a:custGeom>"); expect(exported).toContain("<a:cubicBezTo>");
    expect(exported).toContain('w="28575"'); expect(exported).toContain('<a:prstDash val="dash"/>');
    const imported = readSceneShape(props(exported), base, 1 / 9525, () => {});
    expect(imported.shapeKind).toBe("custom"); expect(imported.shapePath).toEqual(path);
    expect(imported.strokeWidth).toBeCloseTo(3); expect(imported.strokeDash).toBe("dash");
  });
  it("rejects raw SVG/scripts, unsupported commands and invalid numeric geometry", () => {
    expect(normalizeSceneVectorPath('<svg onload="bad()"/>')).toBeUndefined();
    expect(normalizeSceneVectorPath({ ...path, commands: [{ type: "script" }, { type: "Z" }] })).toBeUndefined();
    expect(normalizeSceneVectorPath({ ...path, commands: [{ type: "L", x: 0, y: 0 }, { type: "Z" }] })).toBeUndefined();
    expect(normalizeSceneVectorPath({ ...path, commands: [{ type: "M", x: NaN, y: 0 }, { type: "Z" }] })).toBeUndefined();
    expect(normalizeSlideScene({ version: 2, objects: [{ ...base, shapeKind: "custom" }] })).toBeUndefined();
  });
  it("reports unsupported formula/arc paths rather than silently claiming shape fidelity", () => {
    const xml = '<p:sp><p:spPr><a:custGeom><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:arcTo wR="50" hR="50" stAng="0" swAng="5400000"/></a:path></a:pathLst></a:custGeom></p:spPr></p:sp>';
    const notices: string[] = [];
    expect(readSceneShape(props(xml), base, 1 / 9525, code => notices.push(code)).shapeKind).toBe("rect");
    expect(notices).toContain("shape-geometry");
  });
  it("roundtrips an exported custom curve through the actual staged PPTX importer", async () => {
    const object = normalize({ shapeKind: "custom", shapePath: path });
    const zip = await importFixture(); zip.file("ppt/slides/slide1.xml", slideXml(exportSceneShape(object, 2, 1)));
    const result = await parsePptx(await pack(zip), "curve.pptx"), imported = result.slides[0].scene!.objects.find(o => o.kind === "shape")!;
    expect(imported.shapePath).toEqual(path); expect(imported.rotation).toBeCloseTo(25);
    expect(imported.strokeWidth).toBeCloseTo(3); expect(result.notices.some(n => n.code === "shape-geometry")).toBe(false);
  });
  it("authors custom vectors through the shared SDK without a template restriction", () => {
    const deck = createSlideScript("Vector");
    deck.slide("Custom curve", slide => slide.vector(path, { x: 10, y: 20, w: 500, h: 400 }, "#336699", { stroke: "#112233", strokeWidth: 4 }));
    const object = deck.build().action.slides[0].scene.objects[0];
    expect(object.shapeKind).toBe("custom"); expect(object.shapePath).toEqual(path); expect(object.strokeWidth).toBe(4);
  });
});
