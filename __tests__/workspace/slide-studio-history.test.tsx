// @vitest-environment jsdom
import React, { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emptySlideScene, sceneObject, type SlideScene } from "@/app/workspace/types/slideScene";
import { useSlideSceneHistory, type SlideSceneHistorySlot } from "@/app/workspace/hooks/useSlideSceneHistory";

const initial=emptySlideScene("16:9");
afterEach(cleanup);
function Controls({scene,slot,onChange}:{scene:SlideScene;slot:SlideSceneHistorySlot;onChange:(scene:SlideScene)=>void}){
  const history=useSlideSceneHistory(scene,onChange,false,slot);
  return <>
    <output aria-label="Object count">{scene.objects.length}</output>
    <button type="button" onClick={()=>history.commit({...scene,objects:[...scene.objects,sceneObject("text",20,40)]})}>Insert object</button>
    <button type="button" disabled={!history.canUndo} onClick={history.undo}>Undo edit</button>
    <button type="button" disabled={!history.canRedo} onClick={history.redo}>Redo edit</button>
  </>;
}
function Harness(){
  const [scene,setScene]=useState(initial),[root,setRoot]=useState(0);
  const slot=useRef<SlideSceneHistorySlot>({current:{undo:[],redo:[],expected:JSON.stringify(initial)}});
  return <>
    <button type="button" onClick={()=>setRoot(v=>v+1)}>Toggle fullscreen root</button>
    <button type="button" onClick={()=>setScene({...scene,objects:[sceneObject("shape",30,30)]})}>External update</button>
    <div key={root}><Controls scene={scene} onChange={setScene} slot={slot.current}/></div>
  </>;
}
describe("Scene history across Studio remount",()=>{
  it("restores undo and redo after editor subtree is remounted",()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole("button",{name:"Insert object"}));
    expect(screen.getByLabelText("Object count").textContent).toBe("1");
    fireEvent.click(screen.getByRole("button",{name:"Toggle fullscreen root"}));
    expect((screen.getByRole("button",{name:"Undo edit"}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Undo edit"}));
    expect(screen.getByLabelText("Object count").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button",{name:"Toggle fullscreen root"}));
    expect((screen.getByRole("button",{name:"Redo edit"}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Redo edit"}));
    expect(screen.getByLabelText("Object count").textContent).toBe("1");
  });
  it("refuses to replay old undo records after an external edit",()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole("button",{name:"Insert object"}));
    fireEvent.click(screen.getByRole("button",{name:"External update"}));
    fireEvent.click(screen.getByRole("button",{name:"Toggle fullscreen root"}));
    expect((screen.getByRole("button",{name:"Undo edit"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Object count").textContent).toBe("1");
  });
});
