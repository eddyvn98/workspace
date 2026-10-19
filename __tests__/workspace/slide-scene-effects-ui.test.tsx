// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneTimeline } from "@/app/workspace/components/slides/SlideSceneTimeline";
import { EffectNumber, EffectPath } from "@/app/workspace/components/slides/SlideSceneEffectFields";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { listSceneEffects } from "@/app/workspace/utils/slideSceneEffects";
const initial=normalizeSlideScene({version:2,objects:[{id:"text",kind:"text",x:10,y:10,w:400,h:90,rotation:0,text:"Title"}]})!;
afterEach(cleanup);
describe("Multi-effect timeline editor",()=>{
  it("adds multiple effect categories to one object and reorders without changing layers",()=>{
    const changed=vi.fn();
    function Harness(){const [scene,setScene]=useState(initial);return <SlideSceneTimeline scene={scene} selected="text" onSelect={()=>{}} readOnly={false} onChange={next=>{changed(next);setScene(next);}}/>;}
    render(<Harness/>);
    fireEvent.click(screen.getByRole("button",{name:"Add effect to selection"}));
    fireEvent.change(screen.getByRole("combobox",{name:"New effect category"}),{target:{value:"emphasis"}});
    fireEvent.click(screen.getByRole("button",{name:"Add effect to selection"}));
    fireEvent.change(screen.getByRole("combobox",{name:"New effect category"}),{target:{value:"exit"}});
    fireEvent.click(screen.getByRole("button",{name:"Add effect to selection"}));
    let scene=changed.mock.calls[changed.mock.calls.length-1][0];
    expect(listSceneEffects(scene.objects).map(e=>e.motion.kind)).toEqual(["fade","pulse","fade"]);
    fireEvent.click(screen.getByRole("button",{name:"Move effect 3 earlier"}));
    scene=changed.mock.calls[changed.mock.calls.length-1][0];
    expect(scene.objects.map((o:{id:string})=>o.id)).toEqual(["text"]);
    expect(listSceneEffects(scene.objects).map(e=>e.motion.phase)).toEqual(["entrance","exit","emphasis"]);
    fireEvent.click(screen.getByRole("button",{name:"Delete effect 2"}));
    expect(listSceneEffects(changed.mock.calls[changed.mock.calls.length-1][0].objects)).toHaveLength(2);
  });
  it("does not mutate effects in a read-only scene",()=>{
    const onChange=vi.fn();render(<SlideSceneTimeline scene={initial} selected="text" readOnly onSelect={()=>{}} onChange={onChange}/>);
    const add=screen.getByRole("button",{name:"Add effect to selection"}) as HTMLButtonElement;
    expect(add.disabled).toBe(true);fireEvent.click(add);expect(onChange).not.toHaveBeenCalled();
  });
  it("allows clearing numeric input while typing and commits only on blur",()=>{
    const onChange=vi.fn();render(<EffectNumber label="Duration" value={600} min={100} max={5000} onChange={onChange}/>);
    const input=screen.getByRole("spinbutton",{name:"Duration"});
    fireEvent.change(input,{target:{value:""}});expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input,{target:{value:"1200"}});expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);expect(onChange).toHaveBeenLastCalledWith(1200);
  });
  it("rejects incomplete paths without replacing the persisted path",()=>{
    const onChange=vi.fn();render(<EffectPath points={[{x:0,y:0},{x:100,y:0}]} onChange={onChange}/>);
    const input=screen.getByRole("textbox",{name:"Motion path points"});
    fireEvent.change(input,{target:{value:"0, 0\n120,"}});
    fireEvent.click(screen.getByRole("button",{name:"Apply path"}));expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(input,{target:{value:"0, 0\n120, 80\n200, 60"}});
    fireEvent.click(screen.getByRole("button",{name:"Apply path"}));expect(onChange).toHaveBeenLastCalledWith([{x:0,y:0},{x:120,y:80},{x:200,y:60}]);
  });
});
