import { describe, expect, it } from "vitest";
import { normalizeSceneTable, sceneTableLayout, createSceneTable } from "@/app/workspace/types/slideSceneTable";
import { normalizeSlideScene, sceneObject } from "@/app/workspace/types/slideScene";
import { deleteSceneTableAxis, insertSceneTableAxis, mergeSceneTable, pasteSceneTable, patchSceneTable, setSceneTableWeight, tableRange, unmergeSceneTable } from "@/app/workspace/utils/slideSceneTableOps";
import { duplicateSceneSelection } from "@/app/workspace/utils/slideSceneGroups";
import { resizeSceneSelection } from "@/app/workspace/utils/slideSceneGroupTransform";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
const table=()=>normalizeSceneTable({rows:[["A","B","C"],["D","E","F"],["G","H","I"]],columnWidths:[1,2,1],rowHeights:[1,1,2],headerRow:true})!;
describe("Native editable slide table",()=>{
  it("creates one scene object with an independently editable cell grid",()=>{
    const object=sceneObject("table");expect(object.kind).toBe("table");expect(object.table?.rows).toHaveLength(4);
    expect(normalizeSlideScene({version:2,objects:[object]})?.objects).toHaveLength(1);
    expect(createSceneTable(2,2).rows[0][0].text).toBe("Column 1");
  });
  it("rejects invalid grids text limits weights and overlapping merges",()=>{
    expect(normalizeSceneTable({rows:[["a"],["b","c"]]})).toBeUndefined();
    expect(normalizeSceneTable({rows:[["a".repeat(2001)]]})).toBeUndefined();
    expect(normalizeSceneTable({rows:[["a"]],columnWidths:[0]})).toBeUndefined();
    const base=table();expect(normalizeSceneTable({...base,merges:[{row:0,column:0,rowSpan:2,colSpan:2},{row:1,column:1,rowSpan:2,colSpan:2}]})).toBeUndefined();
  });
  it("merges only display geometry and restores covered values on unmerge",()=>{
    const base=table(),range={row:0,column:0,endRow:1,endColumn:1};
    const merged=mergeSceneTable(base,range),layout=sceneTableLayout(merged);
    expect(layout).toHaveLength(6);expect(layout[0]).toMatchObject({x:0,y:0,w:0.75,h:0.5,rowSpan:2,colSpan:2});
    expect(merged.rows[1][1].text).toBe("E");expect(base.merges).toEqual([]);
    expect(unmergeSceneTable(merged,range).rows).toEqual(base.rows);
    expect(sceneTableLayout(unmergeSceneTable(merged,range))).toHaveLength(9);
  });
  it("does not silently split an existing merge with a crossing selection",()=>{
    const merged=mergeSceneTable(table(),{row:0,column:0,endRow:1,endColumn:1});
    expect(()=>mergeSceneTable(merged,{row:1,column:1,endRow:2,endColumn:2})).toThrow("crosses");
  });
  it("inserts and deletes axes with stable grid values and merge references",()=>{
    const merged=mergeSceneTable(table(),{row:0,column:0,endRow:1,endColumn:1});
    const inserted=insertSceneTableAxis(merged,"row",1);
    expect(inserted.merges[0]).toMatchObject({row:0,rowSpan:3});expect(inserted.rows[2][1].text).toBe("E");
    expect(deleteSceneTableAxis(inserted,"row",1)).toEqual(merged);
    const shifted=insertSceneTableAxis(merged,"column",0);expect(shifted.merges[0].column).toBe(1);
    expect(deleteSceneTableAxis(shifted,"column",0)).toEqual(merged);
    expect(()=>deleteSceneTableAxis(createSceneTable(1,1),"row",0)).toThrow("at least one");
  });
  it("formats a rectangle immutably and preserves non-selected cells",()=>{
    const base=table(),range=tableRange({row:0,column:1},{row:1,column:2});
    const formatted=patchSceneTable(base,range,{bold:true,italic:true,underline:true,align:"right",fill:"#ffeeaa"});
    expect(formatted.rows[1][2]).toMatchObject({text:"F",bold:true,italic:true,underline:true,align:"right"});
    expect(formatted.rows[2][2]).toEqual(base.rows[2][2]);expect(base.rows[1][2].bold).toBeUndefined();
  });
  it("grows for TSV data but keeps spreadsheet formulas inert",()=>{
    const base=createSceneTable(1,1);const next=pasteSceneTable(base,0,0,"Name\tValue\nAI\t=1+1\nTest\t42\n");
    expect(next.rows).toHaveLength(3);expect(next.rows[0]).toHaveLength(2);expect(next.rows[1][1].text).toBe("=1+1");
    expect(base.rows).toHaveLength(1);
    const merged=mergeSceneTable(table(),{row:0,column:0,endRow:0,endColumn:1});
    expect(()=>pasteSceneTable(merged,0,0,"x\ty")).toThrow("Unmerge");
  });
  it("keeps relative sizes and deep copies native cell data when duplicating",()=>{
    const base=setSceneTableWeight(table(),"column",1,5);
    const object={...sceneObject("table"),id:"t",table:base};const scene=normalizeSlideScene({version:2,objects:[object]})!;
    const copy=duplicateSceneSelection(scene,["t"],()=>"copy");
    copy.objects[1].table!.rows[0][0].text="Changed";expect(scene.objects[0].table!.rows[0][0].text).toBe("A");
    expect(scene.objects[0].table!.columnWidths).toEqual([1,5,1]);
  });
  it("scales explicit table-cell typography with a group transform",()=>{
    const data=patchSceneTable(table(),tableRange({row:1,column:1}),{fontSize:32});
    const scene=normalizeSlideScene({version:2,objects:[{...sceneObject("table"),id:"t",x:0,y:0,w:500,h:200,table:data}]})!;
    const scaled=resizeSceneSelection(scene,["t"],{x:0,y:0,w:1000,h:400});
    expect(scaled.objects[0].fontSize).toBe(44);expect(scaled.objects[0].table!.rows[1][1].fontSize).toBe(64);
    expect(data.rows[1][1].fontSize).toBe(32);
  });
  it("allows the shared SDK to author and animate native tables",()=>{
    const deck=createSlideScript("Native table");
    deck.slide("Data",slide=>{const id=slide.table([["Area","Result"],["North",42]],{x:100,y:100,w:900,h:360});slide.effect(id,{kind:"fade"}).effect(id,{phase:"exit"});});
    const object=deck.build().action.slides[0].scene.objects[0];expect(object.kind).toBe("table");
    expect(object.table!.rows[1][1].text).toBe("42");expect(object.animations).toHaveLength(2);
  });
});
