import sharp from "sharp";
export type TablePaint={hex:string;alpha:number};
/** Per-export cache. Invalid colors fail explicitly rather than changing the authored palette. */
export function createTablePaintResolver(){
  const cache=new Map<string,Promise<TablePaint>>();
  return (color:string):Promise<TablePaint>=>{
    const key=color||"transparent";
    if(!cache.has(key))cache.set(key,(async()=>{
      if(key==="transparent")return {hex:"000000",alpha:0};
      try{
        const rgba=await sharp({create:{width:1,height:1,channels:4,background:key}}).raw().toBuffer();
        return {hex:rgba.subarray(0,3).toString("hex").toUpperCase(),alpha:rgba[3]/255};
      }catch{throw new Error(`Unsupported table color: ${key.slice(0,80)}`);}
    })());
    return cache.get(key)!;
  };
}
export function tableFillXml(paint:TablePaint,opacity=1):string{
  const alpha=Math.round(Math.max(0,Math.min(1,paint.alpha*opacity))*100000);
  return alpha===0?"<a:noFill/>":`<a:solidFill><a:srgbClr val="${paint.hex}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
}
