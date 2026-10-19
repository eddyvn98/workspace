"use client";

import React from "react";
import type { SlideAspectRatio, SlideTheme } from "../../types/slide";
import { slideBackground, slideTextStyle } from "../../utils/slideTheme";
import { sanitizeSlideHtmlForRender } from "../../utils/slideHtmlRender";
import type { SlideScene } from "../../types/slideScene";
import { SlideSceneSurface } from "./SlideSceneSurface";

/** Non-interactive, scaled-down rendering of a slide's rich-text HTML body -
 *  shared by the editor filmstrip (SlideThumbnail) and Present mode's grid
 *  overview (SlidePresentGrid), so both scale the same source content the
 *  same way instead of drifting apart. */
export function SlideMiniPreview({ html, backgroundColor, theme, aspectRatio = "16:9", scene }: { html: string; scene?: SlideScene; backgroundColor?: string; theme?: SlideTheme; aspectRatio?: SlideAspectRatio }) {
  const safeHtml = React.useMemo(() => sanitizeSlideHtmlForRender(html || ""), [html]);
  return (
    <div
      className="relative w-full overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700"
      style={{ backgroundColor: slideBackground(backgroundColor, theme), aspectRatio: aspectRatio === "4:3" ? "4 / 3" : "16 / 9" }}
    >
      {scene ? <SlideSceneSurface scene={scene}/> : <div
        className="slide-cq pointer-events-none absolute left-0 top-0 origin-top-left overflow-hidden"
        // Plain body text in the stored HTML carries no inline color (that's
        // the editor's own CSS class doing it, see
        // WorkspaceDocRichEditorStyles.tsx) - this preview renders outside
        // that class, so without a fixed color here the text inherits the
        // app's dark-mode foreground and disappears against the slide's
        // always-light background.
        style={{ width: "400%", height: "400%", transform: "scale(0.25)", ...slideTextStyle(theme) }}
      >
        <div className="slide-html h-full w-full overflow-hidden" style={{ padding: "4cqw" }} dangerouslySetInnerHTML={{ __html: safeHtml }} />
      </div>}
    </div>
  );
}

export default SlideMiniPreview;
