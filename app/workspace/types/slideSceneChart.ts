/** Chart data is declarative. Workbook formulas, URLs and scripts are not evaluated. */
export const SCENE_CHART_TYPES=["column","bar","line","area","pie","doughnut","scatter"] as const;
export type SceneChartType=typeof SCENE_CHART_TYPES[number];
export type SceneChartSeries={name:string;color:string;values:(number|null)[];xValues?:(number|null)[]};
export type SceneChartData={version:1;type:SceneChartType;categories:string[];series:SceneChartSeries[];title:string;legend:boolean;showValues:boolean;grouping:"none"|"stacked"|"percent";numberFormat:"general"|"decimal"|"percent";background:string;includeZero:boolean};
export const SCENE_CHART_LIMITS={categories:100,series:8,points:800,label:120,title:240,value:1e12} as const;
export const SCENE_CHART_PALETTE=["#2563EB","#EA580C","#16A34A","#9333EA","#DC2626","#0891B2","#CA8A04","#475569"] as const;
const record=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const text=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max&&!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v);
const color=(v:unknown)=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
function values(v:unknown,count:number):(number|null)[]|undefined{
  if(!Array.isArray(v)||v.length!==count||v.some(x=>x!==null&&(typeof x!=="number"||!Number.isFinite(x)||Math.abs(x)>SCENE_CHART_LIMITS.value)))return;
  return [...v];
}
export function normalizeSceneChart(input:unknown):SceneChartData|undefined{
  const r=record(input);if(!r||r.version!==1||!(SCENE_CHART_TYPES as readonly unknown[]).includes(r.type))return;
  const type=r.type as SceneChartType,categories=r.categories,raw=r.series;
  if(!Array.isArray(categories)||!categories.length||categories.length>SCENE_CHART_LIMITS.categories||categories.some(v=>!text(v,SCENE_CHART_LIMITS.label)))return;
  if(!Array.isArray(raw)||!raw.length||raw.length>SCENE_CHART_LIMITS.series||raw.length*categories.length>SCENE_CHART_LIMITS.points)return;
  if((type==="pie"||type==="doughnut")&&raw.length!==1)return;
  const series:SceneChartSeries[]=[];
  for(const [index,value] of raw.entries()){
    const s=record(value);if(!s||!text(s.name,SCENE_CHART_LIMITS.label))return;
    const data=values(s.values,categories.length);if(!data)return;
    if((type==="pie"||type==="doughnut")&&data.some(v=>v!==null&&v<0))return;
    if(s.color!==undefined&&!color(s.color))return;
    const xValues=s.xValues===undefined?undefined:values(s.xValues,categories.length);
    if(s.xValues!==undefined&&!xValues)return;
    if(type==="scatter"&&!xValues)return;
    series.push({name:s.name as string,color:typeof s.color==="string"?s.color.toUpperCase():SCENE_CHART_PALETTE[index%SCENE_CHART_PALETTE.length],values:data,...(xValues?{xValues}:{})});
  }
  const grouping=r.grouping??"none",format=r.numberFormat??"general";
  if(!["none","stacked","percent"].includes(String(grouping))||grouping!=="none"&&!["column","bar"].includes(type))return;
  if(grouping==="percent"&&series.some(s=>s.values.some(v=>v!==null&&v<0)))return;
  if(!["general","decimal","percent"].includes(String(format)))return;
  for(const key of ["legend","showValues","includeZero"])if(r[key]!==undefined&&typeof r[key]!=="boolean")return;
  if(r.title!==undefined&&!text(r.title,SCENE_CHART_LIMITS.title))return;
  if(r.background!==undefined&&r.background!=="transparent"&&!color(r.background))return;
  return {version:1,type,categories:[...categories] as string[],series,title:r.title as string??"",legend:r.legend!==false,showValues:r.showValues===true,
    grouping:grouping as SceneChartData["grouping"],numberFormat:format as SceneChartData["numberFormat"],background:r.background as string??"#FFFFFF",includeZero:r.includeZero!==false};
}
export function sceneChartFromObject(object:{chart?:SceneChartData;series?:Array<{label:string;value:number}>;fill?:string}):SceneChartData{
  if(object.chart)return object.chart;
  const values=object.series??[{label:"A",value:1}];
  return {version:1,type:"column",categories:values.map(s=>s.label),series:[{name:"Value",color:color(object.fill)?object.fill!:"#4F46E5",values:values.map(s=>s.value)}],title:"",legend:false,showValues:false,grouping:"none",numberFormat:"general",background:"#FFFFFF",includeZero:true};
}
export function defaultSceneChart():SceneChartData{
  return {version:1,type:"column",categories:["Q1","Q2","Q3"],series:[{name:"Plan",color:"#2563EB",values:[25,40,35]},{name:"Actual",color:"#16A34A",values:[20,45,38]}],title:"",legend:true,showValues:false,grouping:"none",numberFormat:"general",background:"#FFFFFF",includeZero:true};
}
export function chartNumber(value:number,format:SceneChartData["numberFormat"]="general"):string{
  if(format==="percent")return `${Number((value*100).toFixed(2))}%`;
  if(format==="decimal")return value.toFixed(2);
  if(Math.abs(value)>=1e9)return `${Number((value/1e9).toFixed(2))}B`;
  if(Math.abs(value)>=1e6)return `${Number((value/1e6).toFixed(2))}M`;
  if(Math.abs(value)>=1e3)return `${Number((value/1e3).toFixed(2))}k`;
  return String(Number(value.toFixed(3)));
}
