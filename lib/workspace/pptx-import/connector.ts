import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import type { ObjectContext } from "./objects";
import type { Matrix } from "./geometry";
import { child, numeric, NS } from "./xml";
import { paint, opacity } from "./style";
import { appendObjects } from "./model";
/** Connectors may legally have a zero-height or zero-width extent; ordinary shape frames may not. */
export function readSceneConnector(node: Element, parent: Matrix, groupId: string | undefined, ctx: ObjectContext): void {
  const props=child(node,NS.p,"spPr"),xfrm=child(props,NS.a,"xfrm"),off=child(xfrm,NS.a,"off"),ext=child(xfrm,NS.a,"ext");
  if(!xfrm||!off||!ext){ctx.notice("connector-position","A connector without a position was omitted.");return;}
  const x=numeric(off,"x"),y=numeric(off,"y"),w=numeric(ext,"cx"),h=numeric(ext,"cy");
  if(w<0||h<0||w+h===0){ctx.notice("connector-position","A zero-length or invalid connector was omitted.");return;}
  const angle=numeric(xfrm,"rot")/60000*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const flip=(key:string)=>["1","true"].includes(xfrm.getAttribute(key)??"")?-1:1;
  const transform=(u:number,v:number)=>{
    const dx=(u-0.5)*w*flip("flipH"),dy=(v-0.5)*h*flip("flipV");
    const px=x+w/2+dx*cos-dy*sin,py=y+h/2+dx*sin+dy*cos;
    return {x:parent[0]*px+parent[2]*py+parent[4],y:parent[1]*px+parent[3]*py+parent[5]};
  };
  const from=transform(0,0),to=transform(1,1),dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  const cx=(from.x+to.x)/2,cy=(from.y+to.y)/2;
  if(!Number.isFinite(length+cx+cy)||length>2560||cx-length/2 < -1280||cx-length/2>2560||cy-4 < -960||cy-4>1920)throw new Error("A connector exceeds editable scene geometry limits.");
  if(length<0.01)return;
  const preset=child(props,NS.a,"prstGeom")?.getAttribute("prst")??"line";
  if(!["line","straightConnector1"].includes(preset)||child(props,NS.a,"custGeom"))ctx.notice("connector-route","A bent/custom connector was converted to an editable straight segment between its transformed endpoints.");
  const line=child(props,NS.a,"ln"),scale=Math.sqrt(Math.abs(parent[0]*parent[3]-parent[1]*parent[2]));
  if(child(line,NS.a,"headEnd")?.getAttribute("type")&&child(line,NS.a,"headEnd")?.getAttribute("type")!=="none"||child(line,NS.a,"tailEnd")?.getAttribute("type")&&child(line,NS.a,"tailEnd")?.getAttribute("type")!=="none")ctx.notice("connector-ends","Connector line-end decorations are not retained; the editable connection is preserved.");
  const dash=child(line,NS.a,"prstDash")?.getAttribute("val"),strokeWidth=numeric(line,"w",19050)*scale;
  const result:SlideSceneObject={id:ctx.nextId(),kind:"shape",shapeKind:"line",x:cx-Math.max(8,length)/2,y:cy-4,w:Math.max(8,length),h:8,rotation:Math.atan2(dy,dx)*180/Math.PI,
    fill:"transparent",stroke:paint(line,ctx.theme,"#334155"),strokeWidth:Math.min(64,Math.max(0,strokeWidth)),strokeDash:dash==="dot"||dash==="sysDot"?"dot":dash&&dash!=="solid"?"dash":"solid",opacity:opacity(line),groupId};
  appendObjects(ctx.objects,[result]);
}
