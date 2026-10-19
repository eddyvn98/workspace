import { emptySlideScene, normalizeSlideScene, type SlideAspectRatio } from "@/app/workspace/types/slideScene";
import type { SceneMotion, SlideScene, SlideSceneObject } from "@/app/workspace/types/slideScene";
import { inspectSlideScene, type SlideSceneWarning } from "@/app/workspace/utils/slideSceneInspect";

/**
 * Authoring SDK for code-execution workers.
 * The LLM writes TypeScript using this API; an isolated worker executes it.
 * Never run model-authored scripts in the Next.js request process.
 */
export type SlideScriptRect = { x: number; y: number; w: number; h: number };
export type SlideScriptTextStyle = Pick<SlideSceneObject, "fontSize" | "fontFamily" | "fontWeight" | "color" | "align" | "rotation" | "opacity">;
export type SlideScriptShapeStyle = Pick<SlideSceneObject, "stroke" | "radius" | "rotation" | "opacity">;
export type SlideScriptOutput = {
  action: {
    type: "create_slide_deck";
    title: string;
    aspectRatio: "16:9" | "4:3";
    slides: Array<{
      name: string;
      html: string;
      scene: SlideScene;
      backgroundColor: string;
      presenterNotes: string;
      transition: "none" | "fade" | "slide" | "zoom" | "wipe";
    }>;
  };
  warnings: Array<{ slide: number; slideName: string } & SlideSceneWarning>;
};
type SlideDraft = {
  name: string; backgroundColor: string; presenterNotes: string;
  transition: "none" | "fade" | "slide" | "zoom" | "wipe";
  objects: SlideSceneObject[];
};
const id = () => crypto.randomUUID();
const rect = (box: SlideScriptRect) => ({ x: box.x, y: box.y, w: box.w, h: box.h });
const MAX_SLIDES = 60;
export class SlideScriptSlide {
  constructor(private readonly draft: SlideDraft) {}
  text(value: string, box: SlideScriptRect, style: SlideScriptTextStyle = {}): string {
    const key = id();
    this.draft.objects.push({ id: key, kind: "text", ...rect(box), rotation: 0, text: value, ...style });
    return key;
  }
  shape(fill: string, box: SlideScriptRect, style: SlideScriptShapeStyle = {}): string {
    const key = id();
    this.draft.objects.push({ id: key, kind: "shape", ...rect(box), rotation: 0, fill, ...style });
    return key;
  }
  image(src: string, box: SlideScriptRect, style: Pick<SlideSceneObject, "rotation" | "opacity"> = {}): string {
    const key = id();
    this.draft.objects.push({ id: key, kind: "image", ...rect(box), rotation: 0, src, ...style });
    return key;
  }
  chart(series: Array<{ label: string; value: number }>, box: SlideScriptRect, fill = "#4F46E5"): string {
    const key = id();
    this.draft.objects.push({ id: key, kind: "chart", ...rect(box), rotation: 0, series, fill });
    return key;
  }
  motion(objectId: string, motion: Partial<SceneMotion> = {}): this {
    const object = this.draft.objects.find((item) => item.id === objectId);
    if (!object) throw new Error(`Unknown slide object: ${objectId}`);
    object.motion = { kind: motion.kind ?? "fade", trigger: motion.trigger ?? "after-previous", durationMs: motion.durationMs ?? 400, delayMs: motion.delayMs ?? 0 };
    return this;
  }
  notes(value: string): this { this.draft.presenterNotes = value; return this; }
  background(value: string): this { this.draft.backgroundColor = value; return this; }
  transition(value: SlideDraft["transition"]): this { this.draft.transition = value; return this; }
}

export class SlideScriptDeck {
  private readonly slides: SlideDraft[] = [];
  readonly aspectRatio: "16:9" | "4:3";
  constructor(readonly title: string, ratio: "16:9" | "4:3" = "16:9") {
    this.aspectRatio = ratio;
  }
  slide(name: string, author: (slide: SlideScriptSlide) => void): this {
    if (this.slides.length >= MAX_SLIDES) throw new Error("A deck cannot exceed 60 slides.");
    const draft: SlideDraft = { name: name.slice(0, 120), backgroundColor: "#FFFFFF", presenterNotes: "", transition: "none", objects: [] };
    author(new SlideScriptSlide(draft));
    if (draft.objects.length > 120) throw new Error("A slide cannot exceed 120 objects.");
    this.slides.push(draft);
    return this;
  }
  build(): SlideScriptOutput {
    if (!this.slides.length) throw new Error("A slide script must produce at least one slide.");
    const warnings: SlideScriptOutput["warnings"] = [];
    const slides = this.slides.map((draft, index) => {
      const scene = normalizeSlideScene({
        ...emptySlideScene(this.aspectRatio), objects: draft.objects,
      }, this.aspectRatio);
      if (!scene) throw new Error(`Slide ${index + 1} contains invalid scene objects.`);
      warnings.push(...inspectSlideScene(scene, draft.backgroundColor).map((warning) => ({
        ...warning, slide: index + 1, slideName: draft.name,
      })));
      return { name: draft.name, html: "", scene, backgroundColor: draft.backgroundColor, presenterNotes: draft.presenterNotes, transition: draft.transition };
    });
    return { action: { type: "create_slide_deck", title: this.title.slice(0, 120), aspectRatio: this.aspectRatio, slides }, warnings };
  }
}

export function createSlideScript(title: string, ratio: "16:9" | "4:3" = "16:9"): SlideScriptDeck {
  return new SlideScriptDeck(title, ratio);
}
