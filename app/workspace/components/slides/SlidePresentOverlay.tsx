"use client";
import React, { useEffect, useRef, useState } from "react";
import { usePresentationKeys } from "../../hooks/usePresentationKeys";
import { animateSlide } from "../../utils/slideMotion";
import { compileSceneTimeline } from "../../utils/slideScenePlayback";
import { SLIDE_TYPOGRAPHY_CSS } from "../../utils/slideTypography";
import { createPortal } from "react-dom";
import type { SlideDeckPayload } from "../../types/slide";
import { SlidePresentControls } from "./SlidePresentControls";
import { SlidePresentGrid } from "./SlidePresentGrid";
import { slideBackground, slideTextStyle } from "../../utils/slideTheme";
import { sanitizeSlideHtmlForRender } from "../../utils/slideHtmlRender";
import { SlideSceneSurface } from "./SlideSceneSurface";

export interface SlidePresentOverlayProps {
  data: SlideDeckPayload; index: number; showGrid: boolean; showNotes: boolean;
  onToggleGrid: () => void; onToggleNotes: () => void; onNext: () => void; onPrev: () => void;
  onJump: (index: number) => void; onExit: () => void;
}
/** Portal-based presenter. Keyboard, mouse and toolbar consume the same click-build schedule. */
export function SlidePresentOverlay({ data, index, showGrid, showNotes, onToggleGrid, onToggleNotes, onNext, onPrev, onJump, onExit }: SlidePresentOverlayProps) {
  const slideId = data.slideOrder[index], slide = slideId ? data.slides[slideId] : undefined;
  const [build, setBuild] = useState({ slideId: "", step: 0 });
  const clickCount = compileSceneTimeline(slide?.scene?.objects ?? []).clickCount;
  // A new slide starts at build zero during render, not a frame later in an effect.
  const step = build.slideId === slideId ? Math.min(build.step, clickCount) : 0;
  const next = () => {
    if (!showGrid && step < clickCount) setBuild({ slideId, step: step + 1 });
    else if (index < data.slideOrder.length - 1) { setBuild({ slideId: "", step: 0 }); onNext(); }
  };
  const prev = () => {
    if (!showGrid && step > 0) setBuild({ slideId, step: step - 1 });
    else if (index > 0) { setBuild({ slideId: "", step: 0 }); onPrev(); }
  };
  const jump = (to: number) => { setBuild({ slideId: "", step: 0 }); onJump(to); };
  usePresentationKeys(true, next, prev, onExit, jump, data.slideOrder.length);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const safeHtml = React.useMemo(() => sanitizeSlideHtmlForRender(slide?.html || ""), [slide?.html]);
  useEffect(() => {
    if (!showGrid && surfaceRef.current) return animateSlide(surfaceRef.current, slide?.transition ?? "none", slide?.animation ?? "none");
  }, [slideId, slide?.transition, slide?.animation, showGrid]);
  if (!slide) return null;
  const ratio = data.aspectRatio === "4:3" ? { css: "4 / 3", value: 4 / 3 } : { css: "16 / 9", value: 16 / 9 };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Slide presentation" className="fixed inset-0 z-[1000] flex flex-col bg-black" onPointerDown={e => e.stopPropagation()}>
      <style>{SLIDE_TYPOGRAPHY_CSS}</style>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-center justify-center overflow-hidden p-8">
          {showGrid ? <SlidePresentGrid data={data} currentIndex={index} onJump={jump} /> : <div
            key={slideId} ref={surfaceRef} onClick={next}
            className="slide-cq relative w-full overflow-hidden rounded shadow-2xl"
            style={{ backgroundColor: slideBackground(slide.backgroundColor, data.theme), aspectRatio: ratio.css,
              maxWidth: `min(64rem, calc((100vh - 8rem) * ${ratio.value}))` }}>
            {slide.scene ? <SlideSceneSurface scene={slide.scene} step={step} /> : <div className="slide-html h-full w-full overflow-auto" style={{ ...slideTextStyle(data.theme), padding: "4cqw" }} dangerouslySetInnerHTML={{ __html: safeHtml }} />}
            {data.showSlideNumbers && <span className="absolute bottom-2 right-3 text-xs opacity-60" style={slideTextStyle(data.theme)}>{index + 1}</span>}
          </div>}
        </div>
        {showNotes && <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-slate-900 p-4 text-sm text-slate-200">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Presenter notes</div>
          <div className="whitespace-pre-wrap">{slide.presenterNotes || "No notes for this slide."}</div>
        </div>}
      </div>
      <SlidePresentControls index={index} total={data.slideOrder.length} canStepBack={!showGrid && step > 0} canStepForward={!showGrid && step < clickCount}
        showGrid={showGrid} showNotes={showNotes} onPrev={prev} onNext={next} onToggleGrid={onToggleGrid} onToggleNotes={onToggleNotes} onExit={onExit} />
    </div>, document.body,
  );
}
export default SlidePresentOverlay;
