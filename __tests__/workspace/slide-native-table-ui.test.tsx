// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneTableEditor } from "@/app/workspace/components/slides/SlideSceneTableEditor";
import { createSceneTable } from "@/app/workspace/types/slideSceneTable";
import { sceneObject } from "@/app/workspace/types/slideScene";
const object=()=>({...sceneObject("table"),id:"table",table:createSceneTable(2,2)});
afterEach(cleanup);
describe("Native table editor",()=>{
  it("keeps cell edits staged until Apply",()=>{
    const source=object(),onApply=vi.fn(),onClose=vi.fn();
    render(<SlideSceneTableEditor object={source} readOnly={false} onApply={onApply} onClose={onClose}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Selected cell text"}),{target:{value:"New title"}});
    expect(onApply).not.toHaveBeenCalled();expect(source.table.rows[0][0].text).toBe("Column 1");
    fireEvent.click(screen.getByRole("button",{name:"Apply table"}));
    expect(onApply).toHaveBeenCalledOnce();expect(onApply.mock.calls[0][0].rows[0][0].text).toBe("New title");expect(onClose).toHaveBeenCalledOnce();
  });
  it("cancels a structural draft without changing the slide",()=>{
    const source=object(),onApply=vi.fn(),onClose=vi.fn();
    render(<SlideSceneTableEditor object={source} readOnly={false} onApply={onApply} onClose={onClose}/>);
    fireEvent.click(screen.getByRole("button",{name:"Insert row after"}));
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(onApply).not.toHaveBeenCalled();expect(onClose).toHaveBeenCalledOnce();expect(source.table.rows).toHaveLength(2);
  });
  it("merges the selected rectangle while retaining covered cell data",()=>{
    const source=object(),onApply=vi.fn();source.table.rows[1][1].text="Retained";
    render(<SlideSceneTableEditor object={source} readOnly={false} onApply={onApply} onClose={()=>{}}/>);
    fireEvent.click(screen.getByRole("button",{name:"Cell 1, 1"}));
    fireEvent.click(screen.getByRole("button",{name:"Cell 2, 2"}),{shiftKey:true});
    fireEvent.click(screen.getByRole("button",{name:"Merge selected cells"}));
    fireEvent.click(screen.getByRole("button",{name:"Apply table"}));
    expect(onApply.mock.calls[0][0].merges).toEqual([{row:0,column:0,rowSpan:2,colSpan:2}]);
    expect(onApply.mock.calls[0][0].rows[1][1].text).toBe("Retained");
  });
  it("refuses to overwrite a newer table arriving from the host application",()=>{
    const source=object(),onApply=vi.fn();
    const view=render(<SlideSceneTableEditor object={source} readOnly={false} onApply={onApply} onClose={()=>{}}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Selected cell text"}),{target:{value:"My draft"}});
    const changed=object();changed.table.rows[0][0].text="Remote change";
    view.rerender(<SlideSceneTableEditor object={changed} readOnly={false} onApply={onApply} onClose={()=>{}}/>);
    expect(screen.getByRole("alert").textContent).toContain("changed outside");
    const button=screen.getByRole("button",{name:"Apply table"}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);fireEvent.click(button);expect(onApply).not.toHaveBeenCalled();
  });
  it("honors the host read-only flag without a separate identity system",()=>{
    const onApply=vi.fn();render(<SlideSceneTableEditor object={object()} readOnly onApply={onApply} onClose={()=>{}}/>);
    expect((screen.getByRole("button",{name:"Apply table"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("textbox",{name:"Selected cell text"}) as HTMLTextAreaElement).disabled).toBe(true);
  });
});
