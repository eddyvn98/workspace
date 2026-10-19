import { normalizeSceneChart, SCENE_CHART_LIMITS, SCENE_CHART_PALETTE, type SceneChartData, type SceneChartSeries } from "@/app/workspace/types/slideSceneChart";
import { child, children, descendants, elements, first, numeric, NS } from "./xml";
import { frame, type Matrix } from "./geometry";
import { appendObjects } from "./model";
import { paint } from "./style";
import type { ObjectContext } from "./objects";
const bool=(node:Element|undefined,fallback=false)=>node?["1","true"].includes(node.getAttribute("val")??""):fallback;
function cache(parent:Element|undefined,numericOnly=false):Element|undefined{
  return first(parent,NS.c,numericOnly?"numCache":"strCache")||first(parent,NS.c,numericOnly?"numLit":"strLit")||first(parent,NS.c,"numCache")||first(parent,NS.c,"numLit");
}
function points(node:Element|undefined):{count:number;values:Map<number,string>}{
  const result=new Map<number,string>();let count=numeric(child(node,NS.c,"ptCount"),"val",0);
  if(!Number.isInteger(count)||count<0||count>SCENE_CHART_LIMITS.categories)throw new Error("Imported chart exceeds 100 categories.");
  for(const pt of children(node,NS.c,"pt")){
    const i=numeric(pt,"idx",-1);if(!Number.isInteger(i)||i<0||i>=SCENE_CHART_LIMITS.categories||result.has(i))throw new Error("Invalid or duplicate chart cache indices.");
    result.set(i,child(pt,NS.c,"v")?.textContent??"");count=Math.max(count,i+1);
  }
  return {count,values:result};
}
function numericValues(data:{count:number;values:Map<number,string>},count:number):(number|null)[]{
  return Array.from({length:count},(_,i)=>{
    const raw=data.values.get(i);if(raw===undefined||raw.trim()==="")return null;
    const value=Number(raw);if(!Number.isFinite(value)||Math.abs(value)>SCENE_CHART_LIMITS.value)throw new Error("Chart cache contains invalid/out-of-range numeric data.");return value;
  });
}
/** Infer the supported includeZero policy from the actual value axis, not the scatter X axis. */
function includesZero(plot:Element|undefined,source:Element):boolean{
  const ids=children(source,NS.c,"axId").map(n=>n.getAttribute("val")),axes=children(plot,NS.c,"valAx");
  const axis=axes.find(n=>child(n,NS.c,"axId")?.getAttribute("val")===ids[ids.length-1])??axes[0];
  const scaling=child(axis,NS.c,"scaling"),min=child(scaling,NS.c,"min")?.getAttribute("val"),max=child(scaling,NS.c,"max")?.getAttribute("val");
  return !((min!==undefined&&min!==null&&Number.isFinite(Number(min))&&Number(min)>0)||(max!==undefined&&max!==null&&Number.isFinite(Number(max))&&Number(max)<0));
}
export async function readSceneChart(node:Element,matrix:Matrix,groupId:string|undefined,ctx:ObjectContext):Promise<void>{
  const reference=first(node,NS.c,"chart"),rel=ctx.rels.get(reference?.getAttributeNS(NS.r,"id")||"");
  if(!reference||!rel||rel.external||!rel.type.endsWith("/chart")){ctx.notice("graphic","An unsupported graphic or linked chart was omitted; no remote data was fetched.");return;}
  const document=await ctx.archive.xml(rel.target),plot=first(document,NS.c,"plotArea"),plots=elements(plot).filter(e=>e.namespaceURI===NS.c&&/Chart$/.test(e.localName));
  const types:Record<string,SceneChartData["type"]>={barChart:"column",lineChart:"line",areaChart:"area",pieChart:"pie",doughnutChart:"doughnut",scatterChart:"scatter"};
  const source=plots[0],sources=children(source,NS.c,"ser");
  if(plots.length!==1||!source||!types[source.localName]||!sources.length||sources.length>SCENE_CHART_LIMITS.series){
    const text=descendants(document,NS.c,"ser").slice(0,SCENE_CHART_LIMITS.series).map((s,i)=>`Series ${i+1}: `+descendants(child(s,NS.c,"val")||child(s,NS.c,"yVal"),NS.c,"v").map(v=>v.textContent??"").join(", ")).join("\n");
    ctx.notice("chart-data","An unsupported/combo chart was retained as cached numeric text; its chart layout is not reproduced.");
    if(text.length>10000)throw new Error("Unsupported chart cached data exceeds text limits.");
    appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"text",...frame(matrix,ctx.notice),text:text||"Chart has no supported cached data",fontSize:24,color:"#0f172a",groupId}]);return;
  }
  const type=source.localName==="barChart"&&child(source,NS.c,"barDir")?.getAttribute("val")==="bar"?"bar":types[source.localName];
  const parsed=sources.map(s=>({source:s,categories:points(cache(child(s,NS.c,"cat"))),values:points(cache(child(s,NS.c,type==="scatter"?"yVal":"val"),true)),xs:points(cache(child(s,NS.c,"xVal"),true))}));
  const count=Math.max(...parsed.map(s=>Math.max(s.categories.count,s.values.count,s.xs.count)));
  if(!count)throw new Error("Chart has no cached values; calculate and save it in PowerPoint before import.");
  const categories=Array.from({length:count},(_,i)=>parsed[0].categories.values.get(i)??String(i+1));
  if(categories.some(c=>c.length>SCENE_CHART_LIMITS.label))throw new Error("Chart category labels exceed 120 characters.");
  const series:SceneChartSeries[]=parsed.map(({source:s,categories:cats,values,xs},i)=>{
    const tx=child(s,NS.c,"tx"),name=child(tx,NS.c,"v")?.textContent||first(tx,NS.c,"v")?.textContent||`Series ${i+1}`;
    if(name.length>SCENE_CHART_LIMITS.label)throw new Error("Chart series name exceeds 120 characters.");
    if([...cats.values].some(([index,value])=>categories[index]!==value))ctx.notice("chart-categories","Different category labels between series were aligned by cache index; review their category names.");
    const color=paint(child(s,NS.c,"spPr"),ctx.theme,paint(child(child(s,NS.c,"spPr"),NS.a,"ln"),ctx.theme,SCENE_CHART_PALETTE[i%SCENE_CHART_PALETTE.length]));
    return {name,color,values:numericValues(values,count),...(type==="scatter"?{xValues:numericValues(xs,count)}:{})};
  });
  const grouped=child(source,NS.c,"grouping")?.getAttribute("val"),grouping=grouped==="stacked"?"stacked":grouped==="percentStacked"?"percent":"none";
  if(grouping!=="none"&&!["bar","column"].includes(type))ctx.notice("chart-grouping","Stacked line/area charts were normalized to their independent series; values are retained.");
  const chartNode=first(document,NS.c,"chart"),titleNode=child(chartNode,NS.c,"title"),title=descendants(titleNode,NS.a,"t").map(t=>t.textContent??"").join("")||first(titleNode,NS.c,"v")?.textContent||"";
  const format=first(document,NS.c,"numFmt")?.getAttribute("formatCode")??first(document,NS.c,"formatCode")?.textContent??"General";
  const numberFormat=format.includes("%")?"percent":format==="0.00"?"decimal":"general";
  const chart=normalizeSceneChart({version:1,type,categories,series,title,grouping:["bar","column"].includes(type)?grouping:"none",legend:!!child(chartNode,NS.c,"legend"),showValues:bool(child(child(source,NS.c,"dLbls"),NS.c,"showVal")),numberFormat,background:paint(child(first(document,NS.c,"chartSpace"),NS.c,"spPr"),ctx.theme,"#FFFFFF"),includeZero:includesZero(plot,source)});
  if(!chart)throw new Error("Imported chart data exceeds supported limits or contains incompatible signed/stacked values.");
  if(type==="doughnut"&&numeric(child(source,NS.c,"holeSize"),"val",55)!==55||numeric(child(source,NS.c,"firstSliceAng"),"val",0)!==0)ctx.notice("chart-pie-layout","Pie starting angle and doughnut hole size use the editable chart defaults.");
  if(first(source,NS.c,"trendline")||first(source,NS.c,"errBars")||first(document,NS.c,"multiLvlStrCache"))ctx.notice("chart-extras","Trendlines, error bars or multilevel category styling are not reproduced; cached numeric values remain editable.");
  ctx.notice("chart-style","Chart type and series were retained as a native editable chart; custom axis/font/legend layout may differ.");
  appendObjects(ctx.objects,[{id:ctx.nextId(),kind:"chart",...frame(matrix,ctx.notice),chart,series:categories.map((label,i)=>({label,value:series[0].values[i]??0})),fill:series[0].color,groupId}]);
}
