import { describe, expect, it } from "vitest";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";

describe("Slide coding-agent SDK", () => {
  it("builds editable slides from procedural TypeScript authoring", () => {
    const deck = createSlideScript("AI strategy");
    deck.slide("Intro", (slide) => {
      slide.background("#0B1026");
      const title = slide.text("AI strategy", {x:80,y:100,w:1050,h:140}, {color:"#FFFFFF",fontSize:70});
      slide.shape("#38BDF8",{x:80,y:280,w:450,h:10});
      slide.motion(title,{kind:"fade",trigger:"after-previous"});
    });
    const result = deck.build();
    expect(result.action.type).toBe("create_slide_deck");
    expect(result.action.slides[0].scene.objects).toHaveLength(2);
    expect(result.action.slides[0].scene.objects[0].motion?.trigger).toBe("after-previous");
  });
  it("supports editable native chart data", () => {
    const deck=createSlideScript("Quarterly results","4:3");
    deck.slide("Growth", s => { s.chart([{label:"Q1",value:100},{label:"Q2",value:150}],{x:80,y:180,w:1000,h:600}); });
    const out=deck.build();
    expect(out.action.slides[0].scene.height).toBe(960);
    expect(out.action.slides[0].scene.objects[0].kind).toBe("chart");
  });
  it("warns about low contrast without silently rewriting objects", () => {
    const deck=createSlideScript("Quality");
    deck.slide("Bad", s => { s.text("Invisible", {x:100,y:100,w:300,h:80},{color:"#FFFFFF"}); });
    const out=deck.build();
    expect(out.warnings.some(x=>x.code==="contrast")).toBe(true);
    expect(out.action.slides[0].scene.objects[0].color).toBe("#FFFFFF");
  });
  it("enforces the 60-slide limit", () => {
    const deck=createSlideScript("Bounded");
    for(let i=0;i<60;i++)deck.slide("Slide "+i,()=>{});
    expect(()=>deck.slide("Too many",()=>{})).toThrow();
  });
});
