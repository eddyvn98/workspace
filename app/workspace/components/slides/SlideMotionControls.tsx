"use client";
import type { SlideMeta } from "../../types/slide";
import { SLIDE_ANIMATIONS, SLIDE_TRANSITIONS } from "../../utils/slideMotion";

export function SlideMotionControls({ slide, onChange, readOnly = false, showContentAnimation = true }: { slide: SlideMeta; onChange: (patch: Partial<SlideMeta>) => void; readOnly?: boolean; showContentAnimation?: boolean }) {
  return <div className="flex items-center gap-3 text-xs text-slate-700" onPointerDown={(e) => e.stopPropagation()}>
    <label>Transition <select aria-label="Slide transition" disabled={readOnly} value={slide.transition ?? "none"} onChange={(e) => onChange({ transition: e.target.value as SlideMeta["transition"] })}>
      {SLIDE_TRANSITIONS.map((item) => <option key={item}>{item}</option>)}
    </select></label>
    {showContentAnimation && <label>Content <select aria-label="Content animation" disabled={readOnly} value={slide.animation ?? "none"} onChange={(e) => onChange({ animation: e.target.value as SlideMeta["animation"] })}>
      {SLIDE_ANIMATIONS.map((item) => <option key={item}>{item}</option>)}
    </select></label>}
  </div>;
}
