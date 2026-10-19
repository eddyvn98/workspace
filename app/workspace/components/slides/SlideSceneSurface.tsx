"use client";
import React, { useEffect, useRef, useState } from "react";
import type { SlideScene } from "../../types/slideScene";

type Props = { scene: SlideScene; selected?: string | null; editing?: boolean; onSelect?: (id: string) => void; onMove?: (id: string, x: number, y: number) => void; step?: number };
export function SlideSceneSurface({ scene, selected, editing = false, onSelect, onMove, step }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; left: number; top: number } | null>(null);
  const [offset, setOffset] = useState<{x:number;y:number}>({x:0,y:0});
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      setOffset({x:(e.clientX-drag.left)*scene.width/box.width,y:(e.clientY-drag.top)*scene.height/box.height});
    };
    const up = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (box) onMove?.(drag.id, Math.round(drag.x + (e.clientX-drag.left)*scene.width/box.width), Math.round(drag.y + (e.clientY-drag.top)*scene.height/box.height));
      setDrag(null); setOffset({x:0,y:0});
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
    return () => {window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
  }, [drag, scene.width, scene.height, onMove]);
  return <div ref={ref} className="absolute inset-0 overflow-hidden" style={{containerType:"size"}}>
    {scene.objects.map((o, index) => {
      const motion = o.motion;
      const hiddenByClick = !editing && step !== undefined && motion?.trigger === "on-click" && scene.objects.slice(0,index+1).filter(x=>x.motion?.trigger==="on-click").length>step;
      return <div key={o.id} data-scene-object={o.id} data-motion={motion?.kind || "none"} data-trigger={motion?.trigger || "with-previous"}
        data-duration={motion?.durationMs || 450} data-delay={motion?.delayMs || 0}
        onPointerDown={e => {
          if (!editing || o.locked) return;
          e.preventDefault();e.stopPropagation();onSelect?.(o.id);
          setDrag({id:o.id,x:o.x,y:o.y,left:e.clientX,top:e.clientY});setOffset({x:0,y:0});
        }}
        className={editing && !o.locked ? "cursor-move" : ""}
        style={{position:"absolute",left:`${(o.x+(drag?.id===o.id?offset.x:0))/scene.width*100}%`,top:`${(o.y+(drag?.id===o.id?offset.y:0))/scene.height*100}%`,
          width:`${o.w/scene.width*100}%`,height:`${o.h/scene.height*100}%`,transform:`rotate(${o.rotation}deg)`,opacity:hiddenByClick?0:o.opacity??1,
          outline: editing && selected===o.id?"2px solid #6366f1":undefined,transformOrigin:"center",overflow:"hidden",pointerEvents:editing?"auto":"none"}}>
        {o.kind==="text" && <div style={{color:o.color,fontSize:`${(o.fontSize || 44)/scene.width*100}cqw`,fontFamily:o.fontFamily || "Arial",fontWeight:o.fontWeight,
          textAlign:o.align,whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.12}}>{o.text}</div>}
        {o.kind==="shape" && <div className="h-full w-full" style={{background:o.fill,border:o.stroke && o.stroke!=="transparent" ? `2px solid ${o.stroke}`:undefined,borderRadius:`${o.radius||0}px`}}/>}
        {o.kind==="image" && o.src && <img alt="" src={o.src} draggable={false} className="h-full w-full object-cover"/>}
      </div>;
    })}
  </div>;
}
