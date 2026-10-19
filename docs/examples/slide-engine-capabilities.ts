import { createSlideScript } from "../../lib/slide-agent/slideScriptSdk";
import { defaultSceneChart } from "../../app/workspace/types/slideSceneChart";
import { defaultSceneGradient, defaultSceneShadow } from "../../app/workspace/types/slideScenePaint";

/** Synthetic example data. Produces an action only; the host owns execution and persistence. */
export function buildSlideEngineDemo(imageUrl?: string) {
  if (imageUrl && !/^\/api\/workspace-images\/ws_[a-f0-9]+$/.test(imageUrl)) throw new Error("Use an existing Workspace-uploaded image URL.");
  const deck = createSlideScript("Slide engine capability example");
  deck.slide("Typography and paint", slide => {
    slide.background("#0F172A");
    slide.shape("#2563EB", { x: 720, y: 80, w: 450, h: 550 }, { shapeKind: "roundRect", radius: 36, gradient: defaultSceneGradient(), shadow: defaultSceneShadow() });
    const title = slide.richText({ version: 1, paragraphs: [
      { runs: [{ text: "One editable scene", bold: true, color: "#FFFFFF", fontSize: 58 }] },
      { runs: [{ text: "Text, vector shapes and native data", color: "#CBD5E1", fontSize: 28 }] }
    ] }, { x: 80, y: 180, w: 570, h: 220 });
    slide.effect(title, { phase: "entrance", kind: "fade", trigger: "on-click", durationMs: 600 });
    slide.notes("This example tests data/editor/export behavior. It is not a claim about a real business.");
  });
  deck.slide("Native chart and rich cells", slide => {
    slide.text("Synthetic quarterly data", { x: 70, y: 40, w: 1100, h: 90 }, { fontSize: 46 });
    slide.chart({ ...defaultSceneChart(), type: "line", title: "Plan and actual", includeZero: false,
      series: [{ name: "Plan", color: "#2563EB", values: [20, null, 35] }, { name: "Actual", color: "#16A34A", values: [25, 32, 40] }]
    }, { x: 70, y: 180, w: 680, h: 430 });
    slide.table([
      ["Item", "Status"],
      ["Native table", { text: "Derived", richText: { version: 1, paragraphs: [{ runs: [{ text: "Editable ", bold: true }, { text: "rich cell", italic: true, color: "#16A34A" }] }] } }],
      ["Missing chart point", "Preserved as null"]
    ], { x: 800, y: 200, w: 410, h: 350 }, { fontSize: 21 });
  });
  deck.slide("Nested groups and diagram", slide => {
    const a = slide.shape("#2563EB", { x: 80, y: 100, w: 240, h: 110 }, { shapeKind: "roundRect" });
    const b = slide.text("Grouped text", { x: 100, y: 120, w: 200, h: 70 }, { fontSize: 30, color: "#FFFFFF" });
    const inner = slide.group([a, b]);
    const c = slide.shape("#EA580C", { x: 380, y: 100, w: 150, h: 110 }, { shapeKind: "ellipse" });
    slide.group([inner, c]);
    slide.diagram({ version: 1, layout: "process", nodes: [{ id: "plan", label: "Plan" }, { id: "build", label: "Build" }, { id: "review", label: "Review" }], edges: [{ from: "plan", to: "build" }, { from: "build", to: "review" }], color: "#2563EB" }, { x: 80, y: 320, w: 1100, h: 290 });
  });
  if (imageUrl) deck.slide("Exact two-axis crop", slide => {
    slide.text("Original pixels, editable crop", { x: 80, y: 40, w: 1100, h: 90 }, { fontSize: 42 });
    slide.image(imageUrl, { x: 240, y: 180, w: 800, h: 420 }, {
      imageCrop: { left: 0.12, top: 0.18, right: 0.22, bottom: 0.08 },
      imageViewport: { left: 0.04, top: 0.02, right: 0.06, bottom: 0.03 },
      imageMask: { shapeKind: "roundRect", radius: 32 }, rotation: 8, shadow: defaultSceneShadow()
    });
  });
  return deck.build();
}
console.log(JSON.stringify(buildSlideEngineDemo(process.argv[2]), null, 2));
