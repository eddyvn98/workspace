"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePresentationKeys } from "../../hooks/usePresentationKeys";
import { animateSlide } from "../../utils/slideMotion";
import { SLIDE_TYPOGRAPHY_CSS } from "../../utils/slideTypography";
import { createPortal } from "react-dom";
import type { SlideDeckPayload } from "../../types/slide";
import { SlidePresentControls } from "./SlidePresentControls";
import { SlidePresentGrid } from "./SlidePresentGrid";
import { slideBackground, slideTextStyle } from "../../utils/slideTheme";
import { sanitizeSlideHtmlForRender } from "../../utils/slideHtmlRender";
import { SlideSceneSurface } from "./SlideSceneSurface";

export interface SlidePresentOverlayProps {
  data: SlideDeckPayload;
  index: number;
  showGrid: boolean;
  showNotes: boolean;
  onToggleGrid: () => void;
  onToggleNotes: () => void;
  onNext: () => void;
  onPrev: () => void;
  onJump: (index: number) => void;
  onExit: () => void;
}

/** Fullscreen, viewport-fixed presentation surface - a portal to document.body
 *  so it renders above the infinite canvas regardless of pan/zoom, matching
 *  how WorkspaceShareDialog.tsx already escapes the canvas for its own
 *  fullscreen-ish overlay. Arrow keys/Escape navigate; audience interaction
 *  during a live presentation (Miro's "show cursors/comments/drawing tools to
 *  viewers") is out of scope here since this workspace has no concept of a
 *  distinct "presenter vs viewer" role during a session yet. */
export function SlidePresentOverlay({ data, index, showGrid, showNotes, onToggleGrid, onToggleNotes, onNext, onPrev, onJump, onExit }: SlidePresentOverlayProps) {
  const [step, setStep] = useState(0);
  const current = data.slides[data.slideOrder[index]];
  const clickCount = current?.scene?.objects.filter(o => o.motion?.trigger === "on-click").length ?? 0;
  const next = () => { if (step < clickCount) setStep(v => v + 1); else onNext(); };
  const prev = () => { if (step > 0) setStep(v => v - 1); else onPrev(); };
  usePresentationKeys(true, next, prev, onExit, onJump, data.slideOrder.length);
  useEffect(() => setStep(0), [index]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const slideId = data.slideOrder[index];
  const slide = slideId ? data.slides[slideId] : undefined;
  const safeHtml = React.useMemo(() => sanitizeSlideHtmlForRender(slide?.html || ""), [slide?.html]);
  useEffect(() => {
    if (!showGrid && surfaceRef.current) return animateSlide(surfaceRef.current, slide?.transition ?? "none", slide?.animation ?? "none");
  }, [slideId, slide?.transition, slide?.animation, showGrid]);
  if (!slide) return null;
  const ratio = data.aspectRatio === "4:3" ? { css: "4 / 3", value: 4 / 3 } : { css: "16 / 9", value: 16 / 9 };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Slide presentation" className="fixed inset-0 z-[1000] flex flex-col bg-black" onPointerDown={(e) => e.stopPropagation()}>
      <style>{SLIDE_TYPOGRAPHY_CSS}</style>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-center justify-center overflow-hidden p-8">
          {showGrid ? (
            <SlidePresentGrid data={data} currentIndex={index} onJump={onJump} />
          ) : (
            <div
              key={slideId}
              ref={surfaceRef}
              onClick={next}
              className="slide-cq relative w-full overflow-hidden rounded shadow-2xl"
              style={{
                backgroundColor: slideBackground(slide.backgroundColor, data.theme),
                aspectRatio: ratio.css,
                // Fit the slide inside the viewport for either ratio (the old fixed 16:9 box squashed 4:3 decks).
                maxWidth: `min(64rem, calc((100vh - 8rem) * ${ratio.value}))`,
              }}
            >
              {/* Same fixed-light-background/no-color-class gap as
                  SlideMiniPreview.tsx - without this the body text inherits
                  the app's dark-mode foreground and disappears here too. */}
              {slide.scene ? <SlideSceneSurface scene={slide.scene} step={step}/> : <div className="slide-html h-full w-full overflow-auto" style={{ ...slideTextStyle(data.theme), padding: "4cqw" }} dangerouslySetInnerHTML={{ __html: safeHtml }} />}
              {data.showSlideNumbers && (
                <span className="absolute bottom-2 right-3 text-xs opacity-60" style={slideTextStyle(data.theme)}>{index + 1}</span>
              )}
            </div>
          )}
        </div>
        {showNotes && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-slate-900 p-4 text-sm text-slate-200">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Presenter notes</div>
            <div className="whitespace-pre-wrap">{slide.presenterNotes || "No notes for this slide."}</div>
          </div>
        )}
      </div>
      <SlidePresentControls
        index={index}
        total={data.slideOrder.length}
        canStepBack={step > 0}
        canStepForward={step < clickCount}
        showGrid={showGrid}
        showNotes={showNotes}
        onPrev={prev}
        onNext={next}
        onToggleGrid={onToggleGrid}
        onToggleNotes={onToggleNotes}
        onExit={onExit}
      />
    </div>,
    document.body,
  );
}

export default SlidePresentOverlay;
