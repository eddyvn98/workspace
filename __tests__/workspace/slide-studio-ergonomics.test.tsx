// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneViewport } from "@/app/workspace/components/slides/SlideSceneViewport";
import { SlideSceneResizableInspector } from "@/app/workspace/components/slides/SlideSceneResizableInspector";
import { SlideRibbonScrollableRow } from "@/app/workspace/components/slides/SlideRibbonScrollableRow";
import { emptySlideScene } from "@/app/workspace/types/slideScene";
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
