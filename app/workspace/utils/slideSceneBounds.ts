export type SceneBounds={x:number;y:number;w:number;h:number};
export function sceneObjectBounds(object:SceneBounds&{rotation:number}):SceneBounds{
  const rad=object.rotation*Math.PI/180,cos=Math.abs(Math.cos(rad)),sin=Math.abs(Math.sin(rad));
  const w=object.w*cos+object.h*sin,h=object.w*sin+object.h*cos;
  return {x:object.x+(object.w-w)/2,y:object.y+(object.h-h)/2,w,h};
}
export function unionSceneBounds(objects:Array<SceneBounds&{rotation:number}>):SceneBounds|null{
  if(!objects.length)return null;
  const boxes=objects.map(sceneObjectBounds),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
}
export function sceneNeedsUniformScale(objects:Array<{rotation:number}>):boolean{
  return objects.some(o=>Math.abs(Math.sin(o.rotation*Math.PI/90))>1e-7);
}
