// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { normalizeSlideScene, type SceneMotion } from "@/app/workspace/types/slideScene";
import { compileSceneTimeline, sceneBuildState } from "@/app/workspace/utils/slideScenePlayback";
import { scenePptxTiming } from "@/lib/workspace/pptx-scene-timing";
import { exportBoardPptx } from "@/lib/workspace/pptx-export";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { importSceneTiming } from "@/lib/workspace/pptx-import/timing";
import { readMotionPath } from "@/lib/workspace/pptx-import/timing-effects";
import { parseXml, NS } from "@/lib/workspace/pptx-import/xml";
const effect=(kind:SceneMotion["kind"],order:number,extra:Partial<SceneMotion>={}):SceneMotion=>({kind,order,trigger:"on-click",durationMs:600,delayMs:0,...extra});
const make=(animations:SceneMotion[],ratio:"16:9"|"4:3"="16:9")=>normalizeSlideScene({version:2,objects:[{id:"title",kind:"text",x:100,y:80,w:700,h:120,rotation:15,text:"Motion tiếng Việt",fontSize:48,color:"#123456",animations}]},ratio)!;
const board=(scene:ReturnType<typeof make>)=>({title:"Animated deck",blocks:{d:{type:"slideDeck",data:{aspectRatio:scene.height===960?"4:3":"16:9",slideOrder:["s"],slides:{s:{id:"s",name:"Motion",html:"",scene}}}}},blockOrder:["d"]});
describe("Native PresentationML animation support",()=>{
  it("generates unique time nodes targeting actual editable shape IDs",()=>{
    const scene=make([effect("fade",0),effect("pulse",1),effect("spin",2),effect("move",3,{path:[{x:0,y:0},{x:120,y:20}]}),effect("wipe",4,{phase:"exit"})]);
    const xml=scenePptxTiming(scene),doc=parseXml(`<p:sld xmlns:p="${NS.p}">${xml}</p:sld>`,"timing");
    const ids=Array.from(doc.getElementsByTagNameNS(NS.p,"cTn")).map(n=>n.getAttribute("id"));
    expect(ids.length).toBe(new Set(ids).size);
    expect(Array.from(doc.getElementsByTagNameNS(NS.p,"spTgt")).every(n=>n.getAttribute("spid")==="2")).toBe(true);
    for(const tag of ["animEffect","animScale","animRot","animMotion","seq"])expect(doc.getElementsByTagNameNS(NS.p,tag).length).toBeGreaterThan(0);
    expect(xml).toContain('nodeType="mainSeq"');expect(xml).toContain('evt="onNext"');
    expect(xml).not.toContain("javascript");
  });
  it.each(["16:9","4:3"] as const)("exports and imports entrance emphasis path exit for %s",async ratio=>{
    const scene=make([effect("fade",0),effect("pulse",1),effect("move",2,{path:[{x:0,y:0},{x:120,y:20},{x:200,y:80}],easing:"linear"}),effect("fade",3,{phase:"exit"})],ratio);
    const output=await exportBoardPptx(board(scene),["d"],async()=>null);
    const zip=await JSZip.loadAsync(output.buffer),source=await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(source).toContain("<p:timing>");
    const imported=await parsePptx(new Uint8Array(output.buffer),"animation.pptx");
    const text=imported.slides[0].scene!.objects.find(o=>o.text==="Motion tiếng Việt")!;
    expect(text).toBeDefined();expect(text.animations).toHaveLength(4);
    const plan=compileSceneTimeline(imported.slides[0].scene!.objects);
    expect(plan.cues.map(c=>c.phase)).toEqual(["entrance","emphasis","motion","exit"]);
    expect(plan.clickCount).toBe(4);
    expect(sceneBuildState(plan,text.id,3,true).x).toBeCloseTo(200,3);
    expect(sceneBuildState(plan,text.id,3,true).y).toBeCloseTo(80,3);
    expect(sceneBuildState(plan,text.id,4,true).visible).toBe(false);
    expect(imported.notices.filter(n=>n.code==="animation")).toEqual([]);
  });
  it("preserves automatic, after-previous and with-previous timings",()=>{
    const scene=normalizeSlideScene({version:2,objects:[
      {id:"a",kind:"text",x:100,y:80,w:500,h:100,rotation:0,text:"A",animations:[effect("fade",0,{trigger:"with-previous",delayMs:50}),effect("fade",3,{phase:"exit",trigger:"on-click",delayMs:30})]},
      {id:"b",kind:"text",x:100,y:250,w:500,h:100,rotation:0,text:"B",animations:[effect("fade",1,{trigger:"on-click",delayMs:100}),effect("pulse",2,{trigger:"after-previous",delayMs:20})]},
    ]})!;
    const imported=scene.objects.map(o=>{const copy={...o};delete copy.animations;return copy;});
    const notices:string[]=[];
    importSceneTiming(parseXml(`<p:sld xmlns:p="${NS.p}">${scenePptxTiming(scene)}</p:sld>`,"timing"),imported,new Map([["2",["a"]],["3",["b"]]]),1280,720,(code)=>notices.push(code));
    expect(compileSceneTimeline(imported).cues.map(c=>[c.id,c.step,c.startMs,c.durationMs])).toEqual(compileSceneTimeline(scene.objects).cues.map(c=>[c.id,c.step,c.startMs,c.durationMs]));
  });
  it("does not create timing for empty/static decks",()=>{
    expect(scenePptxTiming(make([]))).toBe("");expect(scenePptxTiming(make([effect("none",0)]))).toBe("");
  });
  it("accepts bounded straight paths and rejects curves or injected payloads",()=>{
    expect(readMotionPath("M 0 0 L 0.25 0.5 E",1280,720)).toEqual([{x:0,y:0},{x:320,y:360}]);
    expect(readMotionPath("M 0 0 C 0 0 1 1 2 2 E",1280,720)).toBeUndefined();
    expect(readMotionPath("M 0 0 L 0.2 0.3 E;alert(1)",1280,720)).toBeUndefined();
    expect(readMotionPath("M 0 0 L 99 99 E",1280,720)).toBeUndefined();
  });
  it("reports interactive or unsupported sequences rather than executing commands",()=>{
    const notices:string[]=[];
    const doc=parseXml(`<p:sld xmlns:p="${NS.p}"><p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="interactiveSeq"><p:childTnLst><p:cmd type="call" cmd="ignored"/></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>`,"unsupported");
    expect(importSceneTiming(doc,[],new Map(),1280,720,code=>notices.push(code))).toBe(0);
    expect(notices).toContain("animation-interactive");expect(notices).toContain("animation-media");
  });
});
