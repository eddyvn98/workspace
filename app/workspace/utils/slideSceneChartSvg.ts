import { chartNumber, normalizeSceneChart, SCENE_CHART_PALETTE, type SceneChartData } from "../types/slideSceneChart";
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
const number=(v:number)=>Number(v.toFixed(5));
const attr=(v:number)=>String(number(v));
const shorten=(s:string,n=24)=>s.length>n?s.slice(0,n-1)+"\u2026":s;
export function chartDomain(values:number[],includeZero=true):{min:number;max:number}{
  let min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
  if(includeZero){min=Math.min(0,min);max=Math.max(0,max);}
  if(min===max){const pad=Math.abs(min)*0.1||1;min-=pad;max+=pad;}
  return {min,max};
}
/** This serializer emits only fixed SVG primitives with escaped text and validated numeric/color data. */
export function sceneChartSvgContent(input:SceneChartData,width:number,height:number,fontFamily="Arial"):string{
  const data=normalizeSceneChart(input);if(!data)throw new Error("Invalid chart data.");
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error("Invalid chart dimensions.");
  const w=width,h=height,font=Math.max(5,Math.min(20,w/30,h/18)),ink="#334155",grid="#CBD5E1",parts:string[]=[];
  const text=(x:number,y:number,value:string,anchor="middle",size=font,color=ink)=>`<text x="${attr(x)}" y="${attr(y)}" text-anchor="${anchor}" font-family="${escape(fontFamily)}" font-size="${attr(size)}" fill="${color}">${escape(value)}</text>`;
  const line=(x1:number,y1:number,x2:number,y2:number,stroke=grid)=>`<line x1="${attr(x1)}" y1="${attr(y1)}" x2="${attr(x2)}" y2="${attr(y2)}" stroke="${stroke}" stroke-width="1"/>`;
  const rect=(x:number,y:number,rw:number,rh:number,fill:string)=>`<rect x="${attr(x)}" y="${attr(y)}" width="${attr(Math.max(0,rw))}" height="${attr(Math.max(0,rh))}" fill="${fill}"/>`;
  if(data.background!=="transparent")parts.push(rect(0,0,w,h,data.background));
  const pie=data.type==="pie"||data.type==="doughnut",legendEntries=pie?data.categories.map((name,i)=>({name,color:SCENE_CHART_PALETTE[i%SCENE_CHART_PALETTE.length]})):data.series;
  const legendCols=Math.max(1,Math.floor(w/(font*9))),legendRows=data.legend?Math.ceil(legendEntries.length/legendCols):0;
  const top=font*(data.title?2.4:1),bottom=font*(2.5+Math.min(legendRows,4)*1.5),left=font*(data.type==="bar"?7:3.6),right=font;
  const plot={x:left,y:top,w:Math.max(1,w-left-right),h:Math.max(1,h-top-bottom)};
  if(data.title)parts.push(text(w/2,font*1.3,shorten(data.title,Math.max(8,Math.floor(w/font))),"middle",font*1.1));
  if(data.legend){
    const count=Math.min(legendEntries.length,legendCols*4);
    for(let i=0;i<count;i++){
      const item=legendEntries[i],x=(i%legendCols)*w/legendCols+font,y=h-font*(Math.min(legendRows,4)-Math.floor(i/legendCols))*1.5+font*0.5;
      parts.push(rect(x,y-font*0.8,font*0.65,font*0.65,item.color),text(x+font,y,shorten(item.name,12),"start",font*0.8));
    }
    if(count<legendEntries.length)parts.push(text(w-font,h-font*0.2,`+${legendEntries.length-count} categories`,"end",font*0.65));
  }
  if(pie){
    const values=data.series[0].values.map(v=>v??0),total=values.reduce((a,b)=>a+b,0),cx=w/2,cy=top+plot.h/2,r=Math.max(1,Math.min(w/2-font*2,plot.h/2-font)),inner=data.type==="doughnut"?r*0.55:0;
    if(!total){parts.push(text(cx,cy,"No positive values"));return parts.join("");}
    let angle=-Math.PI/2;
    values.forEach((value,i)=>{
      if(value<=0)return;const next=angle+value/total*Math.PI*2,large=next-angle>Math.PI?1:0,color=SCENE_CHART_PALETTE[i%SCENE_CHART_PALETTE.length];
      const point=(radius:number,a:number)=>`${attr(cx+radius*Math.cos(a))} ${attr(cy+radius*Math.sin(a))}`;
      let path:string;
      if(value===total){path=`M ${point(r,angle)} A ${r} ${r} 0 1 1 ${point(r,angle+Math.PI)} A ${r} ${r} 0 1 1 ${point(r,angle+2*Math.PI)}`;
        if(inner)path+=` M ${point(inner,angle)} A ${inner} ${inner} 0 1 0 ${point(inner,angle+Math.PI)} A ${inner} ${inner} 0 1 0 ${point(inner,angle+2*Math.PI)} Z`;else path+=" Z";
      }else path=inner?`M ${point(r,angle)} A ${r} ${r} 0 ${large} 1 ${point(r,next)} L ${point(inner,next)} A ${inner} ${inner} 0 ${large} 0 ${point(inner,angle)} Z`:`M ${cx} ${cy} L ${point(r,angle)} A ${r} ${r} 0 ${large} 1 ${point(r,next)} Z`;
      parts.push(`<path d="${path}" fill="${color}" stroke="${data.background==="transparent"?"#FFFFFF":data.background}" stroke-width="1"/>`);
      if(data.showValues&&value/total>0.035){const mid=(angle+next)/2;parts.push(text(cx+Math.cos(mid)*r*0.77,cy+Math.sin(mid)*r*0.77,chartNumber(value,data.numberFormat),"middle",font*0.8,"#FFFFFF"));}
      angle=next;
    });return parts.join("");
  }
  const n=data.categories.length,count=data.series.length,horizontal=data.type==="bar",stack=data.grouping!=="none";
  const series=data.series.map(s=>s.values.slice()),starts=series.map(s=>s.map(()=>0));
  if(stack){
    for(let c=0;c<n;c++){
      const total=data.grouping==="percent"?series.reduce((sum,s)=>sum+(s[c]??0),0):1;
      let positive=0,negative=0;
      for(let i=0;i<count;i++){if(series[i][c]===null)continue;const value=series[i][c]!/(total||1);series[i][c]=value;
        starts[i][c]=value>=0?positive:negative;if(value>=0)positive+=value;else negative+=value;
      }
    }
  }
  const rangeValues=series.flatMap((s,i)=>s.flatMap((v,c)=>v===null?[]:stack?[starts[i][c],starts[i][c]+v]:[v]));
  const domain=data.grouping==="percent"?{min:0,max:1}:chartDomain(rangeValues,data.includeZero||data.type==="column"||horizontal||data.type==="area");
  const mapValue=(v:number)=>horizontal?plot.x+(v-domain.min)/(domain.max-domain.min)*plot.w:plot.y+plot.h-(v-domain.min)/(domain.max-domain.min)*plot.h;
  const format=data.grouping==="percent"?"percent":data.numberFormat;
  for(let i=0;i<=4;i++){
    const value=domain.min+(domain.max-domain.min)*i/4,p=mapValue(value);
    parts.push(horizontal?line(p,plot.y,p,plot.y+plot.h):line(plot.x,p,plot.x+plot.w,p));
    parts.push(horizontal?text(p,plot.y+plot.h+font*1.4,chartNumber(value,format),"middle",font*0.75):text(plot.x-font*0.4,p+font*0.25,chartNumber(value,format),"end",font*0.75));
  }
  if(data.type==="scatter"){
    const xd=chartDomain(data.series.flatMap(s=>(s.xValues??[]).filter((v):v is number=>v!==null)),false);
    const mapX=(v:number)=>plot.x+(v-xd.min)/(xd.max-xd.min)*plot.w;
    for(let i=0;i<=4;i++){const value=xd.min+(xd.max-xd.min)*i/4;parts.push(text(mapX(value),plot.y+plot.h+font*1.4,chartNumber(value),"middle",font*0.75));}
    data.series.forEach(s=>s.values.forEach((v,i)=>{const x=s.xValues?.[i];if(v===null||x===null||x===undefined)return;
      parts.push(`<circle cx="${attr(mapX(x))}" cy="${attr(mapValue(v))}" r="${attr(font*0.22)}" fill="${s.color}"/>`);
      if(data.showValues)parts.push(text(mapX(x),mapValue(v)-font*0.4,chartNumber(v,format),"middle",font*0.7));
    }));return parts.join("");
  }
  const cell=(horizontal?plot.h:plot.w)/n,labelStep=Math.max(1,Math.ceil(n/Math.max(1,Math.floor((horizontal?plot.h:plot.w)/(font*(horizontal?1.5:4))))));
  for(let c=0;c<n;c++)if(c%labelStep===0){const p=(horizontal?plot.y:plot.x)+cell*(c+0.5);parts.push(horizontal?text(plot.x-font*0.5,p+font*0.25,shorten(data.categories[c],16),"end",font*0.8):text(p,plot.y+plot.h+font*1.4,shorten(data.categories[c],10),"middle",font*0.75));}
  data.series.forEach((s,i)=>{
    if(data.type==="column"||horizontal){
      const breadth=cell*0.75/(stack?1:count);
      series[i].forEach((v,c)=>{if(v===null)return;const a=mapValue(stack?starts[i][c]:0),b=mapValue((stack?starts[i][c]:0)+v),position=(horizontal?plot.y:plot.x)+cell*c+cell*0.125+(stack?0:i*breadth);
        parts.push(horizontal?rect(Math.min(a,b),position,Math.abs(b-a),breadth,s.color):rect(position,Math.min(a,b),breadth,Math.abs(b-a),s.color));
        if(data.showValues)parts.push(horizontal?text(b+(v>=0?font*0.3:-font*0.3),position+breadth/2+font*0.25,chartNumber(v,format),v>=0?"start":"end",font*0.65):text(position+breadth/2,b+(v>=0?-font*0.25:font*0.8),chartNumber(v,format),"middle",font*0.65));
      });return;
    }
    let segment:{x:number;y:number;value:number}[]=[];
    const emit=()=>{
      if(!segment.length)return;
      const path=segment.map((p,j)=>`${j?"L":"M"} ${attr(p.x)} ${attr(p.y)}`).join(" ");
      if(data.type==="area")parts.push(`<path d="${path} L ${attr(segment[segment.length-1].x)} ${attr(mapValue(0))} L ${attr(segment[0].x)} ${attr(mapValue(0))} Z" fill="${s.color}" fill-opacity="0.25"/>`);
      parts.push(`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${attr(font*0.12)}"/>`);
      segment.forEach(p=>{parts.push(`<circle cx="${attr(p.x)}" cy="${attr(p.y)}" r="${attr(font*0.16)}" fill="${s.color}"/>`);if(data.showValues)parts.push(text(p.x,p.y-font*0.5,chartNumber(p.value,format),"middle",font*0.7));});segment=[];
    };
    s.values.forEach((v,c)=>{if(v===null){emit();return;}segment.push({x:plot.x+cell*(c+0.5),y:mapValue(v),value:v});});emit();
  });
  return parts.join("");
}
