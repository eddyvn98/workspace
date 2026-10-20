import type { SlideSceneObject } from "../types/slideScene";
export type SceneDiagram={version:1;layout:"process"|"hierarchy"|"cycle";nodes:Array<{id:string;label:string}>;edges:Array<{from:string;to:string}>;color:string};
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function normalizeSceneDiagram(value:unknown):SceneDiagram|undefined{
  const r=record(value);
  if(r.version!==1||!["process","hierarchy","cycle"].includes(String(r.layout))||!Array.isArray(r.nodes)||r.nodes.length<1||r.nodes.length>24||!Array.isArray(r.edges)||r.edges.length>48)return;
  if(typeof r.color!=="string"||!/^#[a-f0-9]{6}$/i.test(r.color))return;
  const nodes:SceneDiagram["nodes"]=[],ids=new Set<string>();
  for(const raw of r.nodes){const n=record(raw);if(typeof n.id!=="string"||!/^[\w-]{1,128}$/.test(n.id)||ids.has(n.id)||typeof n.label!=="string"||n.label.length>1000)return;ids.add(n.id);nodes.push({id:n.id,label:n.label});}
  const edges:SceneDiagram["edges"]=[],seen=new Set<string>();
  for(const raw of r.edges){const edge=record(raw);if(typeof edge.from!=="string"||typeof edge.to!=="string"||!ids.has(edge.from)||!ids.has(edge.to))return;
    const key=edge.from+":"+edge.to;if(!seen.has(key)){seen.add(key);edges.push({from:edge.from,to:edge.to});}}
  return {version:1,layout:r.layout as SceneDiagram["layout"],nodes,edges,color:r.color.toUpperCase()};
}
type Box={x:number;y:number;w:number;h:number};
/** Layout helpers emit ordinary editable objects; the user/agent can freely redesign every result. */
export function createSceneDiagram(input:SceneDiagram,box:Box,makeId:()=>string):SlideSceneObject[]{
  const data=normalizeSceneDiagram(input);if(!data)throw new Error("Use 1-24 diagram nodes, 0-48 valid edges, and bounded labels.");
  if(Object.values(box).some(v=>!Number.isFinite(v))||box.w<120||box.h<80)throw new Error("Diagram frame is too small.");
  const positions=new Map<string,{cx:number;cy:number}>(),count=data.nodes.length;
  let columns=Math.max(1,Math.ceil(Math.sqrt(count*box.w/box.h))),rows=Math.ceil(count/columns);
  if(data.layout==="hierarchy"){
    const indegree=new Map(data.nodes.map(n=>[n.id,0])),depth=new Map(data.nodes.map(n=>[n.id,0]));
    for(const edge of data.edges)indegree.set(edge.to,indegree.get(edge.to)!+1);
    const queue=data.nodes.filter(n=>!indegree.get(n.id)).map(n=>n.id),visited=new Set<string>();
    while(queue.length){const id=queue.shift()!;if(visited.has(id))continue;visited.add(id);
      for(const edge of data.edges.filter(e=>e.from===id)){depth.set(edge.to,Math.max(depth.get(edge.to)!,depth.get(id)!+1));indegree.set(edge.to,indegree.get(edge.to)!-1);if(!indegree.get(edge.to))queue.push(edge.to);}}
    // Cycles still retain their nodes; place them on a separate last level rather than dropping them.
    const last=Math.max(0,...depth.values());for(const node of data.nodes)if(!visited.has(node.id))depth.set(node.id,last+1);
    const levels=Array.from({length:Math.max(...depth.values())+1},(_,i)=>data.nodes.filter(n=>depth.get(n.id)===i));
    rows=levels.length;columns=Math.max(...levels.map(l=>l.length));
    levels.forEach((level,r)=>level.forEach((node,c)=>positions.set(node.id,{cx:box.x+box.w*(c+0.5)/level.length,cy:box.y+box.h*(r+0.5)/levels.length})));
  }else if(data.layout==="cycle"){
    const radiusX=box.w*0.34,radiusY=box.h*0.34;
    data.nodes.forEach((node,i)=>{const a=-Math.PI/2+i*Math.PI*2/count;positions.set(node.id,{cx:box.x+box.w/2+(count===1?0:Math.cos(a)*radiusX),cy:box.y+box.h/2+(count===1?0:Math.sin(a)*radiusY)});});
  }else data.nodes.forEach((node,i)=>positions.set(node.id,{cx:box.x+box.w*(i%columns+0.5)/columns,cy:box.y+box.h*(Math.floor(i/columns)+0.5)/rows}));
  const bw=Math.max(24,Math.min(data.layout==="cycle"?box.w/3:box.w/columns*0.78,260));
  const bh=Math.max(24,Math.min(data.layout==="cycle"?box.h/4:box.h/rows*0.62,100));
  const outer=makeId(),edges:SlideSceneObject[]=[],nodes:SlideSceneObject[]=[];
  data.edges.forEach(edge=>{
    const a=positions.get(edge.from)!,b=positions.get(edge.to)!;if(edge.from===edge.to)return;
    const dx=b.cx-a.cx,dy=b.cy-a.cy,distance=Math.hypot(dx,dy);if(!distance)return;
    const ux=dx/distance,uy=dy/distance,cut=Math.min(bw/2/Math.max(0.001,Math.abs(ux)),bh/2/Math.max(0.001,Math.abs(uy)));
    const length=Math.max(8,distance-cut*2),cx=(a.cx+b.cx)/2,cy=(a.cy+b.cy)/2;
    edges.push({id:makeId(),kind:"shape",shapeKind:"line",x:cx-length/2,y:cy-4,w:length,h:8,rotation:Math.atan2(dy,dx)*180/Math.PI,fill:"transparent",stroke:data.color,strokeWidth:2,groupId:outer,groupPath:[outer]});
  });
  data.nodes.forEach(node=>{
    const p=positions.get(node.id)!,inner=makeId(),path=[outer,inner],x=p.cx-bw/2,y=p.cy-bh/2;
    nodes.push({id:makeId(),kind:"shape",shapeKind:"roundRect",x,y,w:bw,h:bh,rotation:0,radius:12,fill:data.color,stroke:"transparent",groupId:outer,groupPath:path});
    nodes.push({id:makeId(),kind:"text",x:x+8,y:y+6,w:Math.max(8,bw-16),h:Math.max(8,bh-12),rotation:0,text:node.label,fontSize:Math.max(12,Math.min(24,bh*0.25)),fontFamily:"Arial",color:"#FFFFFF",align:"center",verticalAlign:"middle",groupId:outer,groupPath:path});
  });
  return [...edges,...nodes];
}
