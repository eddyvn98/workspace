// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { defaultSceneChart, normalizeSceneChart, SCENE_CHART_TYPES, type SceneChartData, type SceneChartType } from "@/app/workspace/types/slideSceneChart";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { sceneChartSvgContent } from "@/app/workspace/utils/slideSceneChartSvg";
import { addPptxSceneChart, sceneChartXml } from "@/lib/workspace/pptx-scene-chart";
import { chartShape, rels } from "@/lib/workspace/pptx-elements";
import { parsePptx } from "@/lib/workspace/pptx-import";
import { importFixture, pack, slideXml } from "./pptx-import-fixture";
const chart=(type:SceneChartType):SceneChartData=>({
  ...defaultSceneChart(),type,categories:["1","2","3"],title:"Quarterly <results>",legend:true,showValues:true,includeZero:false,
  series:type==="pie"||type==="doughnut"?[{name:"Share",color:"#2563EB",values:[15,null,30]}]:[
    {name:"Actual",color:"#2563EB",values:[15,null,30],...(type==="scatter"?{xValues:[1,2,3]}:{})},
    {name:"Forecast",color:"#EA580C",values:[20,25,35],...(type==="scatter"?{xValues:[2,4,8]}:{})}
  ]
});
async function roundtrip(input:SceneChartData){
  const zip=await importFixture();
  zip.file("ppt/slides/slide1.xml",slideXml(chartShape(2,"rIdChart",100,120,800,420)));
  zip.file("ppt/slides/_rels/slide1.xml.rels",rels([{id:"rIdChart",type:"chart",target:"../charts/chart1.xml"}]));
  await addPptxSceneChart(zip,1,input);
  return (await parsePptx(await pack(zip),"charts.pptx")).slides[0].scene!.objects.find(o=>o.kind==="chart")!.chart!;
}
describe("Advanced chart data and interchange",()=>{
  it.each(SCENE_CHART_TYPES)("retains %s type series names colors sparse data and title",async type=>{
    const input=chart(type),output=await roundtrip(input);
    expect(output.type).toBe(type);expect(output.categories).toEqual(input.categories);
    expect(output.series.map(s=>s.name)).toEqual(input.series.map(s=>s.name));
    expect(output.series.map(s=>s.values)).toEqual(input.series.map(s=>s.values));
    expect(output.series.map(s=>s.color.toUpperCase())).toEqual(input.series.map(s=>s.color));
    expect(output.title).toBe(input.title);expect(output.legend).toBe(true);expect(output.showValues).toBe(true);
    if(type==="scatter")expect(output.series.map(s=>s.xValues)).toEqual(input.series.map(s=>s.xValues));
    if(type==="line"||type==="scatter")expect(output.includeZero).toBe(false);
  });
  it("keeps signed stacked data rather than treating negatives as absent",async()=>{
    const input={...chart("column"),grouping:"stacked" as const,series:[{name:"Delta",color:"#DC2626",values:[-5,0,10]},{name:"Other",color:"#2563EB",values:[2,-7,3]}]};
    const output=await roundtrip(input);expect(output.grouping).toBe("stacked");expect(output.series.map(s=>s.values)).toEqual(input.series.map(s=>s.values));
  });
  it("keeps explicit percentage stacking",async()=>{
    const output=await roundtrip({...chart("bar"),grouping:"percent"});expect(output.grouping).toBe("percent");
  });
  it("rejects incompatible or excessive series without truncation",()=>{
    expect(normalizeSceneChart({...chart("pie"),series:chart("column").series})).toBeUndefined();
    expect(normalizeSceneChart({...chart("scatter"),series:[{name:"Bad",color:"#2563EB",values:[1,2,3]}]})).toBeUndefined();
    expect(normalizeSceneChart({...chart("line"),series:Array(9).fill(chart("line").series[0])})).toBeUndefined();
    expect(normalizeSceneChart({...chart("column"),series:[{name:"Bad",color:"#2563EB",values:[1,NaN,3]}]})).toBeUndefined();
  });
  it("renders all supported chart types as escaped numeric SVG",()=>{
    for(const type of SCENE_CHART_TYPES){
      const svg=sceneChartSvgContent(chart(type),800,450,'Arial');
      expect(svg).toContain("Quarterly &lt;results&gt;");expect(svg).not.toMatch(/NaN|Infinity|<script/i);
    }
  });
  it("writes editable embedded workbook relationships, not a flat picture",async()=>{
    const zip=new JSZip();await addPptxSceneChart(zip,1,chart("line"));
    expect(zip.file("ppt/embeddings/chart1.xlsx")).not.toBeNull();
    expect(await zip.file("ppt/charts/_rels/chart1.xml.rels")!.async("string")).toContain("../embeddings/chart1.xlsx");
    expect(sceneChartXml(chart("scatter"))).toContain("<c:xVal>");
  });
  it("preserves a structured chart when geometry changes and still accepts legacy charts",()=>{
    const raw={version:2,objects:[{id:"chart",kind:"chart",x:20,y:20,w:700,h:400,rotation:0,chart:chart("line")}]};
    expect(normalizeSlideScene(raw)?.objects[0].chart?.series).toEqual(chart("line").series);
    expect(normalizeSlideScene({version:2,objects:[{...raw.objects[0],chart:undefined,series:[{label:"Q1",value:12}]}]})?.objects[0].series).toEqual([{label:"Q1",value:12}]);
  });
});
