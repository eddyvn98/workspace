// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneRibbon } from "@/app/workspace/components/slides/SlideSceneRibbon";
import { normalizeSlideScene, type SlideSceneObject } from "@/app/workspace/types/slideScene";
const scene=normalizeSlideScene({version:2,objects:[{id:"title",kind:"text",text:"Hello",x:40,y:60,w:600,h:100,rotation:0,fontSize:42}]})!;
const callbacks={
  onAdd:vi.fn(),onUpload:vi.fn(),onDiagram:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),
  onDuplicate:vi.fn(),onDelete:vi.fn(),onGroup:vi.fn(),onUngroup:vi.fn(),
  onPatch:vi.fn(),onFormat:vi.fn(),onShowProperties:vi.fn(),
  onSnap:vi.fn(),onToggleInspector:vi.fn(),onToggleTimeline:vi.fn(),onImageUrl:vi.fn(),
};
const setup=(item?:SlideSceneObject,readOnly=false)=>render(<SlideSceneRibbon
  scene={scene} item={item} selectedCount={item?1:0} selectedLocked={false} readOnly={readOnly}
  uploading={false} canUndo canRedo snap showInspector showTimeline={false}
  imageUrl="" {...callbacks}/>);
afterEach(()=>{cleanup();Object.values(callbacks).forEach(callback=>callback.mockReset());});
describe("Always-visible Slide Studio ribbon",()=>{
  it("offers primary insertion in one click instead of hiding it behind a select",()=>{
    setup();
    for(const label of ["Text box","Shape","Image","Chart","Table"])expect(screen.getByRole("button",{name:label})).toBeTruthy();
    expect(screen.getByRole("button",{name:/Diagram/i})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Text box"}));
    fireEvent.click(screen.getByRole("button",{name:"Shape"}));
    fireEvent.click(screen.getByRole("button",{name:"Chart"}));
    fireEvent.click(screen.getByRole("button",{name:"Table"}));
    expect(callbacks.onAdd.mock.calls.map(call=>call[0])).toEqual(["text","shape","chart","table"]);
    fireEvent.click(screen.getByRole("button",{name:"Image"}));
    expect(callbacks.onUpload).toHaveBeenCalledOnce();
    expect(screen.queryByRole("combobox",{name:"Insert slide object"})).toBeNull();
  });
  it("provides whole-object text formatting without opening properties",()=>{
    setup(scene.objects[0]);
    fireEvent.click(screen.getByRole("button",{name:"Bold text"}));
    fireEvent.click(screen.getByRole("button",{name:"Italic text"}));
    fireEvent.click(screen.getByRole("button",{name:"Underline text"}));
    fireEvent.click(screen.getByRole("button",{name:"Align text center"}));
    expect(callbacks.onPatch.mock.calls.map(call=>call[0])).toEqual([
      {fontWeight:"bold"},{italic:true},{underline:true},{align:"center"},
    ]);
    fireEvent.click(screen.getByRole("button",{name:"Format selected text..."}));
    expect(callbacks.onFormat).toHaveBeenCalledOnce();
  });
  it("opens full settings for a selected shape and allows color changes",()=>{
    const shape:SlideSceneObject={id:"box",kind:"shape",x:5,y:5,w:200,h:100,rotation:0,shapeKind:"rect",fill:"#112233"};
    setup(shape);
    fireEvent.change(screen.getByRole("combobox",{name:"Selected shape type"}),{target:{value:"ellipse"}});
    expect(callbacks.onPatch).toHaveBeenCalledWith({shapeKind:"ellipse"});
    fireEvent.change(screen.getByLabelText("Object color"),{target:{value:"#abcdef"}});
    expect(callbacks.onPatch).toHaveBeenCalledWith({fill:"#abcdef"});
    fireEvent.click(screen.getByRole("button",{name:"shape settings"}));
    expect(callbacks.onShowProperties).toHaveBeenCalledOnce();
  });
  it("respects read-only state while allowing inspector and animation visibility",()=>{
    setup(scene.objects[0],true);
    for(const label of ["Text box","Shape","Image","Chart","Table","Bold text"]){
      expect((screen.getByRole("button",{name:label}) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole("button",{name:"Toggle inspector"}));
    fireEvent.click(screen.getByRole("button",{name:"Toggle animation timeline"}));
    expect(callbacks.onToggleInspector).toHaveBeenCalledOnce();
    expect(callbacks.onToggleTimeline).toHaveBeenCalledOnce();
    expect(callbacks.onPatch).not.toHaveBeenCalled();
  });
});
