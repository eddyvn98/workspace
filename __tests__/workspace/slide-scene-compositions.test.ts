import { describe, expect, it } from "vitest";
import { composeSlideScene, SLIDE_SCENE_STYLES } from "@/app/workspace/utils/slideSceneCompositions";
import { buildDeckSlides } from "@/app/api/workspaces/[id]/agent/slideDeckCreate";

describe("AI slide composition",()=>{
  it.each(["editorial","technology","minimal","playful"] as const)("applies branded visual tokens for %s",style=>{
    const scene=composeSlideScene({title:"A new idea",subtitle:"A consistent slide deck"},style,"hero");
    expect(scene.objects.find(o=>o.id==="title")?.color).toBe(SLIDE_SCENE_STYLES[style].ink);
    expect(scene.objects.find(o=>o.id==="accent-line")?.fill).toBe(SLIDE_SCENE_STYLES[style].accent);
  });
  it.each(["hero","split","metric","statement","columns"] as const)("produces editable %s primitives",layout=>{
    const scene=composeSlideScene({title:"Metrics",subtitle:"Results",metric:"12%",bullets:["One","Two","Three"]},"technology",layout);
    expect(scene.objects.length).toBeGreaterThan(0);
    expect(scene.objects.every(o=>["text","image","shape"].includes(o.kind))).toBe(true);
    expect(scene.objects.map(o=>o.id).length).toBe(new Set(scene.objects.map(o=>o.id)).size);
  });
  it("accepts AI scene creation from composition only",()=>{
    const built=buildDeckSlides([{composition:"metric",designStyle:"technology",title:"Growth",metric:"25%",metricLabel:"YoY"}],[]);
    expect(built.ok).toBe(true);
    if(built.ok){
      expect((built.slides[0].scene as {objects:unknown[]}).objects.length).toBeGreaterThan(0);
      expect(built.slides[0].backgroundColor).toBe(SLIDE_SCENE_STYLES.technology.background);
    }
  });
  it("rejects unsupported style rather than silently substituting",()=>{
    expect(buildDeckSlides([{composition:"hero",designStyle:"unknown",title:"Title"}],[]).ok).toBe(false);
  });
});
