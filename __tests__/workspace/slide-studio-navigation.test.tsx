// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SlideDeckPayload } from "@/app/workspace/types/slide";
import { SlideDeckToolbar } from "@/app/workspace/components/slides/SlideDeckToolbar";
import { SlideFilmstrip } from "@/app/workspace/components/slides/SlideFilmstrip";

const data:SlideDeckPayload={slideOrder:["s1","s2"],activeSlideId:"s1",aspectRatio:"16:9",
  slides:{s1:{id:"s1",name:"Overview",html:"<p>Overview</p>"},s2:{id:"s2",name:"Roadmap",html:"<p>Roadmap</p>"}}};
const callbacks={
  onAdd:vi.fn(),onReorder:vi.fn(),onRename:vi.fn(),onDuplicate:vi.fn(),onDelete:vi.fn(),
  onSetStatus:vi.fn(),onSetBackground:vi.fn(),onSetNotes:vi.fn(),onSetHidden:vi.fn()
};
afterEach(()=>{cleanup();Object.values(callbacks).forEach(fn=>fn.mockClear());});
describe("Presentation Studio navigation and controls",()=>{
  it("opens and exits Studio using the same toolbar control",()=>{
    const toggle=vi.fn();
    const props={aspectRatio:"16:9" as const,slideCount:2,showSlideNumbers:false,
      onChangeAspectRatio:vi.fn(),onChangeTheme:vi.fn(),onApplyBackgroundToAll:vi.fn(),
      onToggleSlideNumbers:vi.fn(),onPresent:vi.fn(),onToggleStudio:toggle};
    const view=render(<SlideDeckToolbar {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:"Open Slide Studio"}));
    expect(toggle).toHaveBeenCalledOnce();
    view.rerender(<SlideDeckToolbar {...props} studioOpen/>);
    fireEvent.click(screen.getByRole("button",{name:"Exit Slide Studio"}));
    expect(toggle).toHaveBeenCalledTimes(2);
  });
  it("keeps slide selection accessible with a vertical rail",()=>{
    const onSelect=vi.fn();
    render(<SlideFilmstrip data={data} orientation="vertical" onSelect={onSelect} {...callbacks}/>);
    expect(screen.getByRole("navigation",{name:"Presentation slides"})).not.toBeNull();
    const item=screen.getByRole("button",{name:"Select slide 2: Roadmap"});
    fireEvent.keyDown(item,{key:"Enter"});
    expect(onSelect).toHaveBeenCalledWith("s2");
  });
  it("prevents slide creation/settings in read-only mode while retaining navigation",()=>{
    const onSelect=vi.fn();
    render(<SlideFilmstrip data={data} orientation="vertical" readOnly onSelect={onSelect} {...callbacks}/>);
    expect((screen.getByRole("button",{name:"Add slide"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button",{name:"Slide settings"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Select slide 1: Overview"}));
    expect(onSelect).toHaveBeenCalledWith("s1");
    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });
});
