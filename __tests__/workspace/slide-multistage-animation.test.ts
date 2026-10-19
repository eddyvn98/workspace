// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { normalizeSlideScene, type SceneMotion } from "@/app/workspace/types/slideScene";
import { normalizeSceneMotion, objectMotions } from "@/app/workspace/types/slideSceneMotion";
import { compileSceneTimeline, createScenePlayback, sceneBuildState } from "@/app/workspace/utils/slideScenePlayback";
import { addSceneEffect, editSceneEffect, listSceneEffects } from "@/app/workspace/utils/slideSceneEffects";
import { sceneInnerTrack, sceneTravelTrack } from "@/app/workspace/utils/slideSceneKeyframes";
import { duplicateSceneSelection, moveSceneSelectionLayer } from "@/app/workspace/utils/slideSceneGroups";
import { createSlideScript } from "@/lib/slide-agent/slideScriptSdk";
const motion=(kind:SceneMotion["kind"],order:number,extra:Partial<SceneMotion>={}):SceneMotion=>({kind,order,trigger:"on-click",durationMs:400,delayMs:0,...extra});
const object={id:"a",kind:"text",x:50,y:80,w:500,h:100,rotation:30,text:"Animated",opacity:0.4};
const make=(animations:SceneMotion[])=>normalizeSlideScene({version:2,objects:[{...object,animations},{...object,id:"b",y:250}]})!;
describe("Multi-stage slide effects",()=>{
  it("keeps legacy effects readable and treats animations arrays as authoritative",()=>{
    const legacy=motion("fade",0);
    expect(objectMotions({motion:legacy})).toEqual([legacy]);
    expect(objectMotions({motion:legacy,animations:[]})).toEqual([]);
    expect(compileSceneTimeline([{id:"a",motion:legacy,animations:[]}]).clickCount).toBe(0);
  });
  it("replays entrance emphasis path and exit state deterministically",()=>{
    const scene=make([motion("fade",0),motion("pulse",1),motion("move",2,{path:[{x:0,y:0},{x:80,y:20},{x:160,y:40}]}),motion("fade",3,{phase:"exit"})]);
    const plan=compileSceneTimeline(scene.objects);
    expect(plan.clickCount).toBe(4);
    expect(plan.cues.map(c=>c.phase)).toEqual(["entrance","emphasis","motion","exit"]);
    expect(sceneBuildState(plan,"a",0)).toEqual({visible:false,x:0,y:0});
    expect(sceneBuildState(plan,"a",1,true)).toEqual({visible:true,x:0,y:0});
    expect(sceneBuildState(plan,"a",3,true)).toEqual({visible:true,x:160,y:40});
    expect(sceneBuildState(plan,"a",4,true)).toEqual({visible:false,x:160,y:40});
    expect(sceneBuildState(plan,"a",2,true)).toEqual({visible:true,x:0,y:0});
  });
  it("leaves exit-only objects visible before their click",()=>{
    const plan=compileSceneTimeline(make([motion("wipe",0,{phase:"exit"})]).objects);
    expect(sceneBuildState(plan,"a",0).visible).toBe(true);
    expect(sceneBuildState(plan,"a",1,true).visible).toBe(false);
  });
  it("sequences overlapping transforms on one target with an explicit warning",()=>{
    const plan=compileSceneTimeline(make([motion("fade",0),motion("spin",1,{trigger:"with-previous"})]).objects);
    expect(plan.cues.map(c=>c.startMs)).toEqual([0,400]);
    expect(plan.warnings).toHaveLength(1);
  });
  it("normalizes bounded waypoint data and limits effect counts",()=>{
    expect(normalizeSceneMotion({kind:"move",path:[{x:44,y:22},{x:Infinity,y:99999}]})).toMatchObject({phase:"motion",path:[{x:0,y:0},{x:0,y:960}]});
    expect(normalizeSlideScene({version:2,objects:[{...object,animations:Array.from({length:13},()=>motion("fade",0))}]})).toBeUndefined();
  });
  it("keeps effect order independent of layer order and clones paths independently",()=>{
    const scene=make([motion("move",0,{path:[{x:0,y:0},{x:90,y:0}]})]);
    const shifted=moveSceneSelectionLayer(scene,["a"],1);
    expect(shifted.objects.map(o=>o.id)).toEqual(["b","a"]);
    expect(compileSceneTimeline(shifted.objects).cues.map(c=>c.id)).toEqual(["a"]);
    let id=0;const copy=duplicateSceneSelection(scene,["a"],()=>`copy-${++id}`);
    expect(compileSceneTimeline(copy.objects).cues.map(c=>c.id)).toEqual(["a","copy-1"]);
    const copied=copy.objects.find(o=>o.id==="copy-1")!;
    copied.animations![0].path![1].x=999;
    expect(scene.objects[0].animations![0].path![1].x).toBe(90);
  });
  it("adds reorders and clears tracks without restoring stale legacy effects",()=>{
    let scene=make([]);
    scene=addSceneEffect(scene,"a",motion("fade",0));scene=addSceneEffect(scene,"b",motion("pulse",1));
    scene=editSceneEffect(scene,1,"up");
    expect(listSceneEffects(scene.objects).map(e=>e.objectId)).toEqual(["b","a"]);
    scene=editSceneEffect(scene,1,"delete");
    expect(scene.objects[0].animations).toEqual([]);
    expect(scene.objects[0].motion).toBeUndefined();
  });
  it("generates a single inner track with monotonic offsets and an independent travel track",()=>{
    const scene=make([motion("fade",0),motion("pulse",1,{trigger:"after-previous"}),motion("move",2,{trigger:"after-previous",path:[{x:0,y:0},{x:50,y:0},{x:50,y:150}]})]);
    const plan=compileSceneTimeline(scene.objects),initial=sceneBuildState(plan,"a",1);
    const inner=sceneInnerTrack(plan.cues,initial,0.5),travel=sceneTravelTrack(plan.cues,initial,0.5)!;
    const offsets=inner.frames.map(f=>Number(f.offset));
    expect(offsets).toEqual([...offsets].sort((a,b)=>a-b));
    expect(travel.frames[travel.frames.length-1].translate).toBe("25px 75px");
  });
  it("supports pause seek rewind and cancellation without rewriting authored geometry",()=>{
    const root=document.createElement("div");root.dataset.sceneWidth="1280";
    root.innerHTML='<div data-scene-object="a" style="transform:rotate(30deg);opacity:0.4"><div data-scene-motion="a"></div></div>';
    const outer=root.firstElementChild as HTMLElement,inner=outer.firstElementChild as HTMLElement;
    const animations:Animation[]=[];
    const animate=vi.fn(()=>{const a={cancel:vi.fn(),pause:vi.fn(),play:vi.fn(),currentTime:0} as unknown as Animation;animations.push(a);return a;});
    outer.animate=animate;inner.animate=animate;
    const plan=compileSceneTimeline(make([motion("move",0,{path:[{x:0,y:0},{x:90,y:40}]})]).objects);
    const controller=createScenePlayback(root,plan,1);
    controller.seek(200);expect(animations.every(a=>a.currentTime===200)).toBe(true);
    controller.play();expect(animations.every(a=>vi.mocked(a.play).mock.calls.length===1)).toBe(true);
    expect(outer.style.transform).toBe("rotate(30deg)");expect(outer.style.opacity).toBe("0.4");
    controller.cancel();controller.cancel();expect(animations.every(a=>vi.mocked(a.cancel).mock.calls.length===1)).toBe(true);
    expect(outer.style.translate).toBe("");
  });
  it("SDK effect calls retain global call order across repeated targets",()=>{
    const deck=createSlideScript("Timeline");
    deck.slide("One",s=>{
      const a=s.text("A",{x:50,y:50,w:300,h:90}),b=s.text("B",{x:50,y:200,w:300,h:90});
      s.effect(a,{kind:"fade"}).effect(b,{kind:"spin"}).effect(a,{kind:"fade",phase:"exit"});
    });
    const scene=deck.build().action.slides[0].scene;
    expect(compileSceneTimeline(scene.objects).cues.map(c=>c.phase)).toEqual(["entrance","emphasis","exit"]);
  });
});
