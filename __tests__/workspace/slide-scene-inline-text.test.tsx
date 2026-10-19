// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneInlineText } from "@/app/workspace/components/slides/SlideSceneInlineText";
import type { SlideSceneObject } from "@/app/workspace/types/slideScene";

const object:SlideSceneObject={id:"heading",kind:"text",x:100,y:100,w:600,h:120,rotation:0,text:"Old title",fontSize:48,color:"#ffffff"};
afterEach(cleanup);
describe("Slide Scene inline text editor",()=>{
  it("focuses an editable text box and commits on blur",()=>{
    const onCommit=vi.fn(),onCancel=vi.fn();
    render(<SlideSceneInlineText object={object} onCommit={onCommit} onCancel={onCancel}/>);
    const textarea=screen.getByRole("textbox",{name:"Edit slide text"});
    expect(document.activeElement).toBe(textarea);
    fireEvent.change(textarea,{target:{value:"Updated heading"}});
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("Updated heading");
    expect(onCancel).not.toHaveBeenCalled();
  });
  it("cancels with Escape instead of changing the scene",()=>{
    const onCommit=vi.fn(),onCancel=vi.fn();
    render(<SlideSceneInlineText object={object} onCommit={onCommit} onCancel={onCancel}/>);
    const textarea=screen.getByRole("textbox");
    fireEvent.change(textarea,{target:{value:"Discard this"}});
    fireEvent.keyDown(textarea,{key:"Escape"});
    fireEvent.blur(textarea);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("supports explicit Ctrl+Enter commit once",()=>{
    const onCommit=vi.fn();
    render(<SlideSceneInlineText object={object} onCommit={onCommit} onCancel={()=>{}}/>);
    const textarea=screen.getByRole("textbox");
    fireEvent.change(textarea,{target:{value:"Saved"}});
    fireEvent.keyDown(textarea,{key:"Enter",ctrlKey:true});
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Saved");
  });
});
