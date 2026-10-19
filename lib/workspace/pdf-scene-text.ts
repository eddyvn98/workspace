import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { richTextFromObject, resolvedSceneTextStyle, sceneParagraphLabels, type SceneTextStyle } from "@/app/workspace/types/slideSceneText";
import { xml } from "./pptx-elements";
type Fragment={text:string;width:number;style:Required<SceneTextStyle>};
type Line={parts:Fragment[];width:number;height:number;font:number;indent:number;align:string;y:number;label?:string;labelX?:number};
/** Conservative font-metric approximation for server SVG; browser and native PPTX retain their own font shaping. */
function advance(text:string,style:Required<SceneTextStyle>):number{
  let units=0;
  for(const c of Array.from(text)){
    if(/\p{Mark}/u.test(c)||c==="\u200d")continue;
    units+=/\s/u.test(c)?0.31:/[ilI.,'`!:;|]/.test(c)?0.29:/[MW@#%]/.test(c)?0.88:c.codePointAt(0)!>=0x2e80?1:0.56;
  }
  return units*style.fontSize*(style.bold?1.035:1);
}
function fragment(text:string,style:Required<SceneTextStyle>):Fragment{return {text,width:advance(text,style),style};}
/** Keep every run's style through wrapping; never flatten mixed formatting into the first run. */
export function pdfSceneRichText(object:SlideSceneObject):string{
  const rich=richTextFromObject(object),labels=sceneParagraphLabels(rich),base=resolvedSceneTextStyle(object),lines:Line[]=[];let cursor=0;
  rich.paragraphs.forEach((p,index)=>{
    const indent=labels[index]?base.fontSize*1.2*((p.level??0)+1):0,available=Math.max(1,object.w-indent),align=p.align??object.align??"left";
    let parts:Fragment[]=[],width=0,firstLine=true;
    cursor+=p.spaceBefore??0;
    const flush=()=>{
      const font=Math.max(base.fontSize,...parts.map(part=>part.style.fontSize)),height=font*(p.lineHeight??1.12);
      lines.push({parts,width,font,height,indent,align,y:cursor,...(firstLine&&labels[index]?{label:labels[index],labelX:base.fontSize*1.2*(p.level??0)}:{})});
      cursor+=height;parts=[];width=0;firstLine=false;
    };
    const append=(value:Fragment)=>{parts.push(value);width+=value.width;};
    for(const run of p.runs){
      const style=resolvedSceneTextStyle(object,run);
      for(const token of run.text.match(/\n|[^\S\n]+|[^\s]+/gu)??[]){
        if(token==="\n"){flush();continue;}
        const item=fragment(token,style);
        if(width>0&&width+item.width>available)flush();
        if(item.width<=available){append(item);continue;}
        let piece="";
        for(const char of Array.from(token)){
          if(piece&&advance(piece+char,style)>available){append(fragment(piece,style));flush();piece="";}
          piece+=char;
        }
        if(piece)append(fragment(piece,style));
      }
    }
    flush();cursor+=p.spaceAfter??0;
  });
  const extra=Math.max(0,object.h-cursor),offset=object.verticalAlign==="middle"?extra/2:object.verticalAlign==="bottom"?extra:0;
  const text=(value:string,x:number,y:number,style:Required<SceneTextStyle>)=>`<text x="${x}" y="${y}" font-family="${xml(style.fontFamily)}" font-size="${style.fontSize}" font-weight="${style.bold?"bold":"normal"}" font-style="${style.italic?"italic":"normal"}" text-decoration="${[style.underline?"underline":"",style.strike?"line-through":""].filter(Boolean).join(" ")||"none"}" fill="${xml(style.color)}" opacity="${style.opacity}" xml:space="preserve">${xml(value)}</text>`;
  return lines.map(line=>{
    const left=object.x+line.indent+(line.align==="center"?(object.w-line.indent-line.width)/2:line.align==="right"?object.w-line.indent-line.width:0);
    const y=object.y+offset+line.y+line.font;let x=left;
    const label=line.label?text(line.label,object.x+(line.labelX??0),y,base):"";
    return label+line.parts.map(part=>{const output=text(part.text,x,y,part.style);x+=part.width;return output;}).join("");
  }).join("");
}
