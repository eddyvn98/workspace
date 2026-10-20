// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { SlideSceneEditor as SlideSceneEditorCore } from "@/app/workspace/components/slides/SlideSceneEditorCore";

const scene=normalizeSlideScene({version:2,objects:[
  {id:"slide-title",kind:"text",text:"Production layout",x:80,y:60,w:700,h:100,rotation:0,fontSize:54},
]})!;
afterEach(cleanup);
describe("Slide Studio editor layout",()=>{
  it("prioritizes stage and keeps animation controls collapsed by default",()=>{
    render(<SlideSceneEditorCore scene={scene} onChange={vi.fn()}/>);
    expect(document.querySelector("[data-slide-stage]")).not.toBeNull();
    expect(screen.queryByRole("region",{name:"Slide object timeline"})).toBeNull();
    const timeline=screen.getByRole("button",{name:"Toggle animation timeline"});
    expect(timeline.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(timeline);
    expect(screen.getByRole("region",{name:"Slide object timeline"})).not.toBeNull();
    expect(timeline.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(timeline);
    expect(screen.queryByRole("region",{name:"Slide object timeline"})).toBeNull();
  });
  it("toggles the inspector without deleting the scene or committing changes",()=>{
    const onChange=vi.fn();
    render(<SlideSceneEditorCore scene={scene} onChange={onChange}/>);
    const button=screen.getByRole("button",{name:"Toggle inspector"});
    expect(screen.getByLabelText("Slide inspector")).not.toBeNull();
    const splitter=screen.getByRole("separator",{name:"Resize inspector"});
    fireEvent.keyDown(splitter,{key:"ArrowLeft"});
    expect(splitter.getAttribute("aria-valuenow")).toBe("304");
    fireEvent.click(button);
    expect(screen.queryByLabelText("Slide inspector")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByLabelText("Slide inspector")).not.toBeNull();
    expect(screen.getByRole("separator",{name:"Resize inspector"}).getAttribute("aria-valuenow")).toBe("304");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("switches inspector between layers and contextual formatting",()=>{
    render(<SlideSceneEditorCore scene={scene} onChange={vi.fn()}/>);
    expect(screen.getByText(/Top layers appear first/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Format"}));
    expect(screen.getByText(/Select a text, shape, image/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Layers"}));
    expect(screen.getByText(/Top layers appear first/)).not.toBeNull();
  });
  it("allows read-only inspection without showing a writable object insert action",()=>{
    render(<SlideSceneEditorCore scene={scene} onChange={vi.fn()} readOnly/>);
    expect((screen.getByRole("button",{name:"Text box"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"Shape"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"Image"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Slide inspector")).not.toBeNull();
  });
});
