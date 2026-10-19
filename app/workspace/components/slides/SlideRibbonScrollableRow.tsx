"use client";
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
/** Scroll hints are only shown when a tool row really overflows. They are also keyboard-usable. */
export function SlideRibbonScrollableRow({label,children,secondary=false}:{
  label:string;children:React.ReactNode;secondary?:boolean;
}){
  const rail=useRef<HTMLDivElement>(null);
  const [left,setLeft]=useState(false),[right,setRight]=useState(false);
  useEffect(()=>{
    const el=rail.current;if(!el)return;
    const update=()=>{setLeft(el.scrollLeft>3);setRight(el.scrollLeft+el.clientWidth<el.scrollWidth-3);};
    update();
    el.addEventListener("scroll",update,{passive:true});
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(update):null;
    observer?.observe(el);
    window.addEventListener("resize",update);
    return()=>{el.removeEventListener("scroll",update);observer?.disconnect();window.removeEventListener("resize",update);};
  },[]);
  const scroll=(by:number)=>rail.current?.scrollBy({left:by,behavior:"smooth"});
  return <div className="relative min-w-0">
    <div ref={rail} aria-label={label}
      className={`flex min-h-12 items-center gap-1.5 overflow-x-auto px-2 py-1.5 ${secondary?"border-t border-slate-100 bg-slate-50/80":"bg-white"}`}>
      {children}
    </div>
    {left&&<button type="button" aria-label={`Scroll ${label} left`} title="More tools on the left"
      onClick={()=>scroll(-260)}
      className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border-r border-slate-200 bg-white/95 shadow-sm hover:bg-indigo-50">
      <ChevronLeft className="h-5 w-5"/>
    </button>}
    {right&&<button type="button" aria-label={`Scroll ${label} right`} title="More tools on the right"
      onClick={()=>scroll(260)}
      className="absolute right-0 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border-l border-slate-200 bg-white/95 shadow-sm hover:bg-indigo-50">
      <ChevronRight className="h-5 w-5"/>
    </button>}
  </div>;
}
