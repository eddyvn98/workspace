// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { SlideSceneCropControls } from "@/app/workspace/components/slides/SlideSceneCropControls";
const object:SlideSceneObject={id:"photo",kind:"image",x:20,y:20,w:300,h:200,rotation:0,src:"/api/workspace-images/ws_abc",imageFit:"cover"};
afterEach(cleanup);
describe("Exact crop inspector",()=>{
  it("edits a draft and publishes a single crop patch on Apply",()=>{
    const onPatch=vi.fn();render(<SlideSceneCropControls object={object} disabled={false} onPatch={onPatch}/>);
    fireEvent.click(screen.getByRole("button",{name:"Edit exact crop"}));
    fireEvent.change(screen.getByLabelText("crop left"),{target:{value:"10"}});fireEvent.change(screen.getByLabelText("crop top"),{target:{value:"20"}});
    expect(onPatch).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Apply crop"}));
    expect(onPatch).toHaveBeenCalledOnce();expect(onPatch).toHaveBeenCalledWith({imageCrop:{left:0.1,top:0.2,right:0,bottom:0},imageViewport:{left:0,top:0,right:0,bottom:0}});
  });
  it("cancel does not publish and invalid crop cannot be applied",()=>{
    const onPatch=vi.fn();render(<SlideSceneCropControls object={object} disabled={false} onPatch={onPatch}/>);
    fireEvent.click(screen.getByText("Edit exact crop"));fireEvent.change(screen.getByLabelText("crop left"),{target:{value:"80"}});fireEvent.change(screen.getByLabelText("crop right"),{target:{value:"80"}});
    fireEvent.click(screen.getByText("Apply crop"));expect(screen.getByRole("alert").textContent).toContain("visible area");expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel crop"));expect(onPatch).not.toHaveBeenCalled();
  });
  it("rejects changed source/crop state but permits unrelated geometry edits",()=>{
    const onPatch=vi.fn(),ui=render(<SlideSceneCropControls object={object} disabled={false} onPatch={onPatch}/>);
    fireEvent.click(screen.getByText("Edit exact crop"));
    ui.rerender(<SlideSceneCropControls object={{...object,src:"/api/workspace-images/ws_def"}} disabled={false} onPatch={onPatch}/>);
    fireEvent.click(screen.getByText("Apply crop"));expect(onPatch).not.toHaveBeenCalled();expect(screen.getByRole("alert").textContent).toContain("changed elsewhere");
    fireEvent.click(screen.getByText("Cancel crop"));fireEvent.click(screen.getByText("Edit exact crop"));
    ui.rerender(<SlideSceneCropControls object={{...object,src:"/api/workspace-images/ws_def",rotation:40,x:100}} disabled={false} onPatch={onPatch}/>);
    fireEvent.click(screen.getByText("Apply crop"));expect(onPatch).toHaveBeenCalledOnce();
  });
  it("does not allow mutation when host marks the object read-only or locked",()=>{
    const onPatch=vi.fn();render(<SlideSceneCropControls object={object} disabled onPatch={onPatch}/>);
    const button=screen.getByText("Edit exact crop") as HTMLButtonElement;expect(button.disabled).toBe(true);fireEvent.click(button);expect(onPatch).not.toHaveBeenCalled();
  });
});
