// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneViewport } from "@/app/workspace/components/slides/SlideSceneViewport";
import { SlideSceneResizableInspector } from "@/app/workspace/components/slides/SlideSceneResizableInspector";
import { SlideRibbonScrollableRow } from "@/app/workspace/components/slides/SlideRibbonScrollableRow";
import { SlideSceneSurface } from "@/app/workspace/components/slides/SlideSceneSurface";
import { emptySlideScene, sceneObject } from "@/app/workspace/types/slideScene";
afterEach(cleanup);
const scene=emptySlideScene("16:9");
describe("Slide Studio ergonomics",()=>{
  it("zooms between 50–400% without changing scene data and Fit resets pan/zoom",()=>{
    const before=JSON.stringify(scene),onPointerDown=vi.fn();
    render(<SlideSceneViewport scene={scene} backgroundColor="#ffffff" onStagePointerDown={onPointerDown}><span>Slide content</span></SlideSceneViewport>);
    const stage=document.querySelector("[data-slide-stage]") as HTMLElement;
    expect(screen.getByLabelText("Canvas zoom").textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button",{name:"Zoom in"}));
    expect(screen.getByLabelText("Canvas zoom").textContent).toBe("125%");
    expect(stage.style.transform).toContain("scale(1.25)");
    fireEvent.click(screen.getByRole("button",{name:"Zoom out"}));
    expect(screen.getByLabelText("Canvas zoom").textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button",{name:"Fit slide"}));
    expect(stage.style.transform).toContain("scale(1)");
    expect(JSON.stringify(scene)).toBe(before);
  });
  it("toggles hand tool and preserves clickable Fit while hand mode is enabled",()=>{
    render(<SlideSceneViewport scene={scene} backgroundColor="#ffffff"><span>Slide</span></SlideSceneViewport>);
    const hand=screen.getByRole("button",{name:"Pan canvas"});
    fireEvent.click(hand);
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button",{name:"Zoom in"}));
    fireEvent.click(screen.getByRole("button",{name:"Fit slide"}));
    expect(screen.getByLabelText("Canvas zoom").textContent).toBe("100%");
    fireEvent.click(hand);
    expect(hand.getAttribute("aria-pressed")).toBe("false");
  });
  it("keeps resize hit targets at constant screen size as zoom changes",()=>{
    render(<SlideSceneViewport scene={scene} backgroundColor="#ffffff"><span>Slide</span></SlideSceneViewport>);
    const stage=document.querySelector("[data-slide-stage]") as HTMLElement;
    expect(stage.style.getPropertyValue("--slide-interaction-scale")).toBe("1");
    fireEvent.click(screen.getByRole("button",{name:"Zoom in"}));
    expect(Number(stage.style.getPropertyValue("--slide-interaction-scale"))).toBeCloseTo(0.8);
    fireEvent.click(screen.getByRole("button",{name:"Zoom out"}));
    expect(stage.style.getPropertyValue("--slide-interaction-scale")).toBe("1");
  });
  it("Escape cancels an unfinished pan without losing Studio or editing content",()=>{
    render(<SlideSceneViewport scene={scene} backgroundColor="#ffffff"><span>Slide</span></SlideSceneViewport>);
    fireEvent.click(screen.getByRole("button",{name:"Pan canvas"}));
    const stage=document.querySelector("[data-slide-stage]") as HTMLElement;
    fireEvent.pointerDown(stage,{button:0,pointerId:9,clientX:100,clientY:120});
    fireEvent.pointerMove(window,{pointerId:9,clientX:150,clientY:140});
    expect(stage.style.transform).toContain("translate(50px, 20px)");
    fireEvent.keyDown(window,{key:"Escape",code:"Escape"});
    expect(stage.style.transform).toContain("translate(0px, 0px)");
    expect(screen.getByRole("button",{name:"Pan canvas"}).getAttribute("aria-pressed")).toBe("true");
  });
  it("Escape cancels object drag and resize without committing geometry",()=>{
    const one=sceneObject("text",80,90);one.id="selection";
    const source={...scene,objects:[one]},onMove=vi.fn(),onResize=vi.fn();
    render(<SlideSceneSurface scene={source} editing selected="selection" selectedIds={["selection"]} onMove={onMove} onResize={onResize}/>);
    const object=document.querySelector('[data-scene-object="selection"]') as HTMLElement;
    fireEvent.pointerDown(object,{button:0,pointerId:11,clientX:80,clientY:90});
    fireEvent.keyDown(window,{key:"Escape",code:"Escape"});
    fireEvent.pointerUp(window,{pointerId:11,clientX:150,clientY:160});
    expect(onMove).not.toHaveBeenCalled();
    const corner=document.querySelector('[data-resize-handle="se"]') as HTMLElement;
    fireEvent.pointerDown(corner,{button:0,pointerId:12,clientX:100,clientY:100});
    fireEvent.keyDown(window,{key:"Escape",code:"Escape"});
    fireEvent.pointerUp(window,{pointerId:12,clientX:180,clientY:200});
    expect(onResize).not.toHaveBeenCalled();
    expect(source.objects[0].x).toBe(80);
  });
  it("resizes the Inspector with keyboard arrows without changing persisted properties",()=>{
    render(<SlideSceneResizableInspector><span>Properties</span></SlideSceneResizableInspector>);
    const separator=screen.getByRole("separator",{name:"Resize inspector"});
    expect(separator.getAttribute("aria-valuenow")).toBe("288");
    fireEvent.keyDown(separator,{key:"ArrowLeft"});
    expect(separator.getAttribute("aria-valuenow")).toBe("304");
    fireEvent.keyDown(separator,{key:"ArrowRight"});
    expect(separator.getAttribute("aria-valuenow")).toBe("288");
    expect(screen.getByText("Properties")).toBeTruthy();
  });
  it("shows overflow navigation only when tools need scrolling",()=>{
    render(<SlideRibbonScrollableRow label="insert tools"><button type="button">Text</button><button type="button">Image</button></SlideRibbonScrollableRow>);
    const rail=screen.getByLabelText("insert tools") as HTMLElement;
    Object.defineProperty(rail,"scrollWidth",{value:600,configurable:true});
    Object.defineProperty(rail,"clientWidth",{value:220,configurable:true});
    Object.defineProperty(rail,"scrollLeft",{value:0,writable:true,configurable:true});
    fireEvent.scroll(rail);
    const next=screen.getByRole("button",{name:"Scroll insert tools right"});
    const scrollBy=vi.fn();Object.defineProperty(rail,"scrollBy",{value:scrollBy,configurable:true});
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({left:260,behavior:"smooth"});
    rail.scrollLeft=260;fireEvent.scroll(rail);
    expect(screen.getByRole("button",{name:"Scroll insert tools left"})).toBeTruthy();
  });
});
