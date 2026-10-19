import { emptySlideScene, normalizeSlideScene, type SceneMotion, type SlideScene, type SlideSceneObject } from "@/app/workspace/types/slideScene";
import { MAX_OBJECT_EFFECTS, MAX_SCENE_EFFECTS, normalizeSceneMotion, objectMotions } from "@/app/workspace/types/slideSceneMotion";
import { normalizeSceneTable, type SceneTableData, type SceneTableCell } from "@/app/workspace/types/slideSceneTable";
import { normalizeSceneRichText, sceneRichTextPlainText, type SceneRichText } from "@/app/workspace/types/slideSceneText";
import { normalizeSceneVectorPath, type SceneVectorPath } from "@/app/workspace/types/slideSceneShape";
import { normalizeSceneChart, type SceneChartData } from "@/app/workspace/types/slideSceneChart";
import { objectGroupPath } from "@/app/workspace/types/slideSceneGroupPath";
import { groupSceneObjects, ungroupSceneObjects } from "@/app/workspace/utils/slideSceneGroups";
import { createSceneDiagram, type SceneDiagram } from "@/app/workspace/utils/slideSceneDiagram";
import { listSceneEffects } from "@/app/workspace/utils/slideSceneEffects";
import { inspectSlideScene, type SlideSceneWarning } from "@/app/workspace/utils/slideSceneInspect";
/** Pure authoring API for the host app and future agents. No generated code, login or network is executed here. */
export type SlideScriptRect={x:number;y:number;w:number;h:number};
export type SlideScriptTextStyle=Partial<Pick<SlideSceneObject,"fontSize"|"fontFamily"|"fontWeight"|"color"|"align"|"rotation"|"opacity"|"italic"|"underline"|"strike"|"verticalAlign"|"shadow">>;
export type SlideScriptShapeStyle=Partial<Pick<SlideSceneObject,"stroke"|"radius"|"rotation"|"opacity"|"shapeKind"|"shapePath"|"strokeWidth"|"strokeDash"|"gradient"|"shadow">>;
export type SlideScriptImageStyle=Partial<Pick<SlideSceneObject,"rotation"|"opacity"|"imageFit"|"imageFocusX"|"imageFocusY"|"imageCrop"|"imageViewport"|"imageMask"|"shadow">>;
export type SlideScriptTableStyle=Partial<Pick<SlideSceneObject,"fontSize"|"fontFamily"|"fontWeight"|"color"|"align"|"rotation"|"opacity"|"fill"|"stroke">>;
export type SlideScriptOutput={
  action:{type:"create_slide_deck";title:string;aspectRatio:"16:9"|"4:3";slides:Array<{name:string;html:string;scene:SlideScene;backgroundColor:string;presenterNotes:string;transition:"none"|"fade"|"slide"|"zoom"|"wipe"}>};
  warnings:Array<{slide:number;slideName:string}&SlideSceneWarning>;
};
type SlideDraft={name:string;backgroundColor:string;presenterNotes:string;transition:"none"|"fade"|"slide"|"zoom"|"wipe";objects:SlideSceneObject[]};
const id=()=>crypto.randomUUID(),rect=(box:SlideScriptRect)=>({x:box.x,y:box.y,w:box.w,h:box.h});
export class SlideScriptSlide{
  constructor(private readonly draft:SlideDraft,private readonly ratio:"16:9"|"4:3"="16:9"){}
  text(value:string,box:SlideScriptRect,style:SlideScriptTextStyle={}):string{
    const key=id(),{rotation=0,...rest}=style;this.draft.objects.push({id:key,kind:"text",...rect(box),rotation,text:value,...rest});return key;
  }
  richText(value:SceneRichText,box:SlideScriptRect,style:SlideScriptTextStyle={}):string{
    const richText=normalizeSceneRichText(value);if(!richText)throw new Error("Invalid rich text: use version 1 and bounded supported paragraphs/runs.");
    const key=id(),{rotation=0,...rest}=style;this.draft.objects.push({id:key,kind:"text",...rect(box),rotation,text:sceneRichTextPlainText(richText),richText,...rest});return key;
  }
  shape(fill:string,box:SlideScriptRect,style:SlideScriptShapeStyle={}):string{
    const key=id(),{rotation=0,...rest}=style;this.draft.objects.push({id:key,kind:"shape",...rect(box),rotation,fill,...rest});return key;
  }
  vector(value:SceneVectorPath,box:SlideScriptRect,fill="#4f46e5",style:Omit<SlideScriptShapeStyle,"shapeKind"|"shapePath">={}):string{
    const shapePath=normalizeSceneVectorPath(value);if(!shapePath)throw new Error("Invalid vector path: supply a viewBox and 2-256 numeric M/L/C/Q/Z commands.");
    return this.shape(fill,box,{...style,shapeKind:"custom",shapePath});
  }
  image(src:string,box:SlideScriptRect,style:SlideScriptImageStyle={}):string{
    const key=id(),{rotation=0,...rest}=style;this.draft.objects.push({id:key,kind:"image",...rect(box),rotation,src,...rest});return key;
  }
  /** Legacy arrays remain supported. Structured data exposes all chart types/series and missing values. */
  chart(input:SceneChartData|Array<{label:string;value:number}>,box:SlideScriptRect,fill="#4F46E5"):string{
    const key=id();
    if(Array.isArray(input))this.draft.objects.push({id:key,kind:"chart",...rect(box),rotation:0,series:input.map(item=>({...item})),fill});
    else{const chart=normalizeSceneChart(input);if(!chart)throw new Error("Invalid structured chart data.");this.draft.objects.push({id:key,kind:"chart",...rect(box),rotation:0,chart,fill});}
    return key;
  }
  table(data:SceneTableData|Array<Array<string|number|boolean|SceneTableCell>>,box:SlideScriptRect,style:SlideScriptTableStyle={}):string{
    const table=normalizeSceneTable(Array.isArray(data)?{rows:data,headerRow:true}:data);
    if(!table)throw new Error("Invalid native table: use 1-30 rows, 1-15 columns, valid merges and bounded cell text.");
    const key=id(),{rotation=0,...rest}=style;this.draft.objects.push({id:key,kind:"table",...rect(box),rotation,table,fontSize:22,fill:"#2563eb",color:"#0f172a",...rest});return key;
  }
  /** A diagram emits editable primitives; it is not a fixed background image. */
  diagram(data:SceneDiagram,box:SlideScriptRect):string[]{
    const objects=createSceneDiagram(data,box,id);
    if(this.draft.objects.length+objects.length>120)throw new Error("Diagram insertion would exceed 120 objects.");
    this.draft.objects.push(...objects);return objects.map(o=>o.id);
  }
  private selection(refs:string[]):string[]{
    const objects=this.draft.objects;
    for(const ref of refs)if(!objects.some(o=>o.id===ref||objectGroupPath(o).includes(ref)))throw new Error(`Unknown slide object/group: ${ref}`);
    return objects.filter(o=>refs.includes(o.id)||objectGroupPath(o).some(group=>refs.includes(group))).map(o=>o.id);
  }
  /** Group references can be passed again to form nested groups, without changing paint order. */
  group(refs:string[]):string{
    const scene={...emptySlideScene(this.ratio),objects:this.draft.objects},key=id(),next=groupSceneObjects(scene,this.selection(refs),()=>key);
    if(next===scene)throw new Error("Group requires at least two editable members and at most 16 levels.");
    this.draft.objects=next.objects;return key;
  }
  ungroup(refs:string[]):this{
    const scene={...emptySlideScene(this.ratio),objects:this.draft.objects},next=ungroupSceneObjects(scene,this.selection(refs));
    this.draft.objects=next.objects;return this;
  }
  /** Replaces an object's chain with one backward-compatible motion. */
  motion(objectId:string,motion:Partial<SceneMotion>={}):this{
    const object=this.draft.objects.find(item=>item.id===objectId);if(!object)throw new Error(`Unknown slide object: ${objectId}`);
    delete object.animations;object.motion=normalizeSceneMotion({kind:"fade",trigger:"after-previous",durationMs:400,delayMs:0,...motion});return this;
  }
  effect(objectId:string,motion:Partial<SceneMotion>):this{
    const object=this.draft.objects.find(item=>item.id===objectId);if(!object)throw new Error(`Unknown slide object: ${objectId}`);
    const entries=listSceneEffects(this.draft.objects);
    if(entries.length>=MAX_SCENE_EFFECTS||objectMotions(object).length>=MAX_OBJECT_EFFECTS)throw new Error("Animation limits: 12 per object and 240 per slide.");
    entries.forEach((entry,order)=>{entry.motion.order=order;});
    const kind=motion.phase==="emphasis"?"pulse":motion.phase==="motion"?"move":"fade";
    const effect=normalizeSceneMotion({kind,trigger:"on-click",durationMs:600,delayMs:0,...motion,order:entries.length});if(!effect)throw new Error("Invalid animation effect");
    object.animations=[...objectMotions(object).map(item=>structuredClone(item)),effect];delete object.motion;return this;
  }
  clearEffects(objectId:string):this{
    const object=this.draft.objects.find(item=>item.id===objectId);if(!object)throw new Error(`Unknown slide object: ${objectId}`);object.animations=[];delete object.motion;return this;
  }
  notes(value:string):this{this.draft.presenterNotes=value;return this;}
  background(value:string):this{this.draft.backgroundColor=value;return this;}
  transition(value:SlideDraft["transition"]):this{this.draft.transition=value;return this;}
}
export class SlideScriptDeck{
  private readonly slides:SlideDraft[]=[];readonly aspectRatio:"16:9"|"4:3";
  constructor(readonly title:string,ratio:"16:9"|"4:3"="16:9"){this.aspectRatio=ratio;}
  slide(name:string,author:(slide:SlideScriptSlide)=>void):this{
    if(this.slides.length>=60)throw new Error("A deck cannot exceed 60 slides.");
    const draft:SlideDraft={name:name.slice(0,120),backgroundColor:"#FFFFFF",presenterNotes:"",transition:"none",objects:[]};author(new SlideScriptSlide(draft,this.aspectRatio));
    if(draft.objects.length>120)throw new Error("A slide cannot exceed 120 objects.");this.slides.push(draft);return this;
  }
  build():SlideScriptOutput{
    if(!this.slides.length)throw new Error("A slide script must produce at least one slide.");
    const warnings:SlideScriptOutput["warnings"]=[];
    const slides=this.slides.map((draft,index)=>{
      const scene=normalizeSlideScene({...emptySlideScene(this.aspectRatio),objects:draft.objects},this.aspectRatio);
      if(!scene)throw new Error(`Slide ${index+1} contains invalid editable scene data.`);
      warnings.push(...inspectSlideScene(scene,draft.backgroundColor).map(warning=>({...warning,slide:index+1,slideName:draft.name})));
      return {name:draft.name,html:"",scene,backgroundColor:draft.backgroundColor,presenterNotes:draft.presenterNotes,transition:draft.transition};
    });
    return {action:{type:"create_slide_deck",title:this.title.slice(0,120),aspectRatio:this.aspectRatio,slides},warnings};
  }
}
export function createSlideScript(title:string,ratio:"16:9"|"4:3"="16:9"):SlideScriptDeck{return new SlideScriptDeck(title,ratio);}
