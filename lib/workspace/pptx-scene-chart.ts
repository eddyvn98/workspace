import ExcelJS from "exceljs";
import type JSZip from "jszip";
import { normalizeSceneChart, SCENE_CHART_PALETTE, type SceneChartData } from "@/app/workspace/types/slideSceneChart";
import { chartDomain } from "@/app/workspace/utils/slideSceneChartSvg";
import { xml, rels } from "./pptx-elements";
const fill=(hex:string,alpha=100000)=>`<a:solidFill><a:srgbClr val="${hex.slice(1)}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
const formatCode=(data:SceneChartData)=>data.grouping==="percent"||data.numberFormat==="percent"?"0.##%":data.numberFormat==="decimal"?"0.00":"General";
const column=(index:number)=>{let s="",n=index;while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
function numRef(formula:string,values:(number|null)[],format="General"):string{
  return `<c:numRef><c:f>${xml(formula)}</c:f><c:numCache><c:formatCode>${xml(format)}</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v,i)=>v===null?"":`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef>`;
}
function stringRef(formula:string,values:string[]):string{
  return `<c:strRef><c:f>${xml(formula)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values.map((v,i)=>`<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef>`;
}
function title(value:string):string{
  return value?`<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN"/><a:t>${xml(value)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`:'<c:autoTitleDeleted val="1"/>';
}
function seriesXml(data:SceneChartData):string{
  const end=data.categories.length+1,pie=data.type==="pie"||data.type==="doughnut";
  return data.series.map((s,i)=>{
    const scatter=data.type==="scatter",valueCol=column(scatter?i*2+3:i+2),xCol=column(i*2+2);
    const name=stringRef(`Data!$${valueCol}$1`,[s.name]);
    const style=data.type==="line"||scatter?`<c:spPr><a:ln w="19050">${fill(s.color)}</a:ln></c:spPr>`:`<c:spPr>${fill(s.color,data.type==="area"?25000:100000)}<a:ln><a:noFill/></a:ln></c:spPr>`;
    const marker=data.type==="line"||scatter?`<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(s.color)}<a:ln><a:noFill/></a:ln></c:spPr></c:marker>`:"";
    const points=pie?data.categories.map((_,j)=>`<c:dPt><c:idx val="${j}"/><c:spPr>${fill(SCENE_CHART_PALETTE[j%SCENE_CHART_PALETTE.length])}<a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`).join(""):"";
    const values=scatter?`<c:xVal>${numRef(`Data!$${xCol}$2:$${xCol}$${end}`,s.xValues!)}</c:xVal><c:yVal>${numRef(`Data!$${valueCol}$2:$${valueCol}$${end}`,s.values,formatCode(data))}</c:yVal>`:
      `<c:cat>${stringRef(`Data!$A$2:$A$${end}`,data.categories)}</c:cat><c:val>${numRef(`Data!$${valueCol}$2:$${valueCol}$${end}`,s.values,formatCode(data))}</c:val>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${name}</c:tx>${style}${marker}${points}${values}${data.type==="line"||scatter?'<c:smooth val="0"/>':""}</c:ser>`;
  }).join("");
}
function labels(data:SceneChartData):string{
  const pie=data.type==="pie"||data.type==="doughnut",position=pie?"bestFit":data.type==="line"||data.type==="scatter"?"t":data.type==="area"?"ctr":data.grouping==="none"?"outEnd":"ctr";
  return `<c:dLbls><c:numFmt formatCode="${xml(formatCode(data))}" sourceLinked="0"/><c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="${data.showValues?1:0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
}
function valueRange(data:SceneChartData):{min:number;max:number}{
  if(data.grouping==="percent")return {min:0,max:1};
  if(data.grouping==="stacked"){
    const sums=data.categories.flatMap((_,i)=>{let positive=0,negative=0;data.series.forEach(s=>{const v=s.values[i]??0;if(v>=0)positive+=v;else negative+=v;});return [positive,negative];});return chartDomain(sums,true);
  }
  return chartDomain(data.series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),data.includeZero||["column","bar","area"].includes(data.type));
}
function axis(data:SceneChartData,id:number,cross:number,value:boolean,x=false):string{
  const bar=data.type==="bar",scatter=data.type==="scatter",tag=value?"valAx":"catAx",position=value?(x||bar?"b":"l"):(bar?"l":"b");
  const domain=value?(x?chartDomain(data.series.flatMap(s=>(s.xValues??[]).filter((v):v is number=>v!==null)),false):valueRange(data)):undefined;
  const scaling=`<c:scaling><c:orientation val="${!value&&bar?"maxMin":"minMax"}"/>${domain?`<c:max val="${domain.max}"/><c:min val="${domain.min}"/>`:""}</c:scaling>`;
  const grid=value&&!x?`<c:majorGridlines><c:spPr><a:ln>${fill("#CBD5E1")}</a:ln></c:spPr></c:majorGridlines>`:"";
  return `<c:${tag}><c:axId val="${id}"/>${scaling}<c:delete val="0"/><c:axPos val="${position}"/>${grid}${value?`<c:numFmt formatCode="${xml(x?"General":formatCode(data))}" sourceLinked="0"/>`:""}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${value?`<c:crossBetween val="${scatter?"midCat":"between"}"/>`:'<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>'}</c:${tag}>`;
}
export function sceneChartXml(input:SceneChartData):string{
  const data=normalizeSceneChart(input);if(!data)throw new Error("Invalid chart data for PowerPoint export.");
  const pie=data.type==="pie"||data.type==="doughnut",series=seriesXml(data),dataLabels=labels(data),ids=pie?"":'<c:axId val="100"/><c:axId val="200"/>';
  let plot:string;
  if(data.type==="column"||data.type==="bar")plot=`<c:barChart><c:barDir val="${data.type==="bar"?"bar":"col"}"/><c:grouping val="${data.grouping==="none"?"clustered":data.grouping==="percent"?"percentStacked":"stacked"}"/><c:varyColors val="0"/>${series}${dataLabels}<c:gapWidth val="100"/><c:overlap val="${data.grouping==="none"?0:100}"/>${ids}</c:barChart>`;
  else if(data.type==="line"||data.type==="area")plot=`<c:${data.type}Chart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${dataLabels}${ids}</c:${data.type}Chart>`;
  else if(data.type==="scatter")plot=`<c:scatterChart><c:scatterStyle val="marker"/><c:varyColors val="0"/>${series}${dataLabels}${ids}</c:scatterChart>`;
  else plot=`<c:${data.type}Chart><c:varyColors val="1"/>${series}${dataLabels}<c:firstSliceAng val="0"/>${data.type==="doughnut"?'<c:holeSize val="55"/>':""}</c:${data.type}Chart>`;
  const axes=pie?"":axis(data,100,200,data.type==="scatter",data.type==="scatter")+axis(data,200,100,true),legend=data.legend?'<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>':"";
  const background=data.background==="transparent"?"<a:noFill/>":fill(data.background);
  return `<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="vi-VN"/><c:chart>${title(data.title)}<c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:spPr>${background}<a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400"/></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}
export async function addPptxSceneChart(zip:JSZip,index:number,input:SceneChartData):Promise<void>{
  const data=normalizeSceneChart(input);if(!data)throw new Error("Invalid chart data.");
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Data"),scatter=data.type==="scatter";
  sheet.addRow(["Category",...data.series.flatMap(s=>scatter?[`${s.name} X`,s.name]:[s.name])]);
  data.categories.forEach((label,i)=>sheet.addRow([label,...data.series.flatMap(s=>scatter?[s.xValues![i],s.values[i]]:[s.values[i]])]));
  zip.file(`ppt/embeddings/chart${index}.xlsx`,await workbook.xlsx.writeBuffer());zip.file(`ppt/charts/chart${index}.xml`,sceneChartXml(data));
  zip.file(`ppt/charts/_rels/chart${index}.xml.rels`,rels([{id:"rId1",type:"package",target:`../embeddings/chart${index}.xlsx`}]));
}
