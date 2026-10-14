"use client";
import React, { useRef, useState } from "react";
interface Props {
  left: number; width: number; label: string; disabled: boolean; highlighted?: boolean;
  onMove: (days: number) => void; onResize: (days: number) => void;
}
type Gesture = { kind: "move" | "resize"; x: number };
const STEP = 26;
/** Pointer capture makes editing work with mouse, pen and touch; buttons remain keyboard fallback. */
export function CollectionGanttBar({ left, width, label, disabled, highlighted, onMove, onResize }: Props) {
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState(0);
  const start = (event: React.PointerEvent<HTMLElement>, kind: Gesture["kind"]) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    gesture.current = { kind, x: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(0);
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (gesture.current) setPreview(Math.round((event.clientX - gesture.current.x) / STEP));
  };
  const finish = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const current = gesture.current;
    gesture.current = null;
    const days = current ? Math.round((event.clientX - current.x) / STEP) : 0;
    setPreview(0);
    if (!current || !days) return;
    if (current.kind === "move") onMove(days);
    else onResize(days);
  };
  return <div className={"absolute top-2 h-7 rounded text-white " + (highlighted ? "bg-amber-600" : "bg-blue-600")}
    role="img" aria-label={label} data-testid="collection-gantt-bar"
    style={{ left: left + (gesture.current?.kind === "move" ? preview * STEP : 0),
      width: Math.max(STEP, width + (gesture.current?.kind === "resize" ? preview * STEP : 0)),
      touchAction: disabled ? undefined : "none", cursor: disabled ? "default" : "grab" }}
    onPointerDown={event => start(event, "move")} onPointerMove={move} onPointerUp={finish}
    onPointerCancel={() => { gesture.current = null; setPreview(0); }}>
    <span className="block truncate px-2 py-1 text-[10px]">{label}</span>
    {!disabled && <div className="absolute right-0 top-0 h-full w-3 cursor-ew-resize border-l border-white/50"
      role="presentation" aria-label={"Resize " + label}
      onPointerDown={event => start(event, "resize")}
      onPointerMove={move} onPointerUp={finish}
      onPointerCancel={() => { gesture.current = null; setPreview(0); }} />}
  </div>;
}
