// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { compileSceneTimeline, playSceneBuild } from "@/app/workspace/utils/slideScenePlayback";
import type { SceneMotion } from "@/app/workspace/types/slideScene";
const object = (id: string, trigger: SceneMotion["trigger"], delayMs = 0, kind: SceneMotion["kind"] = "fade") => ({ id, motion: { trigger, kind, delayMs, durationMs: 400 } });
describe("Scene click build scheduling", () => {
  it("keeps after/with previous animations inside the correct click build", () => {
    const plan = compileSceneTimeline([object("a","with-previous",50), object("b","on-click",100), object("c","after-previous",20), object("d","with-previous",30), object("e","on-click")]);
    expect(plan.clickCount).toBe(2);
    expect(plan.cues.map(c => [c.id,c.step,c.startMs])).toEqual([["a",0,50],["b",1,100],["c",1,520],["d",1,550],["e",2,0]]);
  });
  it("does not consume clicks for none and bounds malformed timing", () => {
    const plan = compileSceneTimeline([object("none","on-click",0,"none"), {id:"bad",motion:{kind:"fade",trigger:"after-previous",durationMs:NaN,delayMs:Infinity}}]);
    expect(plan.clickCount).toBe(0); expect(plan.cues[0]).toMatchObject({id:"bad",startMs:0,durationMs:450});
  });
  it("animates only inner content, hides future builds and preserves authored rotation/opacity", () => {
    const root=document.createElement("div");
    root.innerHTML='<div style="transform:rotate(30deg);opacity:0.4"><div data-scene-motion="a"></div></div><div data-scene-motion="b"></div><div data-scene-motion="c"></div>';
    const targets=Array.from(root.querySelectorAll<HTMLElement>("[data-scene-motion]"));
    const cancel=vi.fn(); for(const t of targets)t.animate=vi.fn(()=>({cancel}) as unknown as Animation);
    const plan=compileSceneTimeline([object("a","on-click"),object("b","after-previous",50),object("c","on-click")]);
    let stop=playSceneBuild(root,plan,0); expect(targets.every(t=>t.style.opacity==="0")).toBe(true); stop();
    stop=playSceneBuild(root,plan,1);
    expect(targets[0].animate).toHaveBeenCalledOnce(); expect(targets[1].animate).toHaveBeenCalledOnce(); expect(targets[2].animate).not.toHaveBeenCalled();
    expect(targets[1].animate).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({delay:450,fill:"both"}));
    expect(root.firstElementChild?.getAttribute("style")).toContain("rotate(30deg)");
    expect((root.firstElementChild as HTMLElement).style.opacity).toBe("0.4"); expect(targets[2].style.opacity).toBe("0");
    stop(); expect(cancel).toHaveBeenCalledTimes(2);
    stop=playSceneBuild(root,plan,0,true); expect(targets.every(t=>t.style.opacity==="0")).toBe(true); stop();
  });
  it("reduced motion reveals reached groups immediately but still waits for later clicks", () => {
    const root=document.createElement("div");root.innerHTML='<div data-scene-motion="a"></div><div data-scene-motion="b"></div>';
    const plan=compileSceneTimeline([object("a","on-click"),object("b","after-previous")]);
    const cancel=playSceneBuild(root,plan,1,true);
    expect(Array.from(root.children).every(e=>(e as HTMLElement).style.opacity==="1")).toBe(true);cancel();
  });
});
