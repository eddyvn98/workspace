"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SlideDeckPayload, SlideStatus, SlideTheme } from "../types/slide";
import * as ops from "../utils/slideDeckOps";
import { starterSlide } from "../utils/slideLayoutTemplates";
import type { SlideLayout } from "@/app/api/workspaces/[id]/agent/slideLayouts";

/** All slide-deck interaction state/handlers for SlideDeckBlock.tsx, mirroring
 *  useTableBlockActions.ts's split (keeps the renderer itself thin). Present
 *  mode's current-slide index is local-only (not written back via onChange)
 *  so stepping through slides during a presentation never spams board writes -
 *  only the editor's "last-viewed slide" (`activeSlideId`) persists. */
export function useSlideDeckActions(data: SlideDeckPayload, onChange: (patch: Partial<SlideDeckPayload>) => void) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [rawPresentIndex, setPresentIndex] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const selectSlide = useCallback(
    (id: string) => onChange(ops.setActiveSlide(data, id)),
    [data, onChange],
  );

  const addSlide = useCallback(
    (layout?: SlideLayout) => onChange(ops.addSlide(data, data.activeSlideId, layout ? starterSlide(layout) : undefined)),
    [data, onChange],
  );
  const duplicateSlide = useCallback((id: string) => onChange(ops.duplicateSlide(data, id)), [data, onChange]);
  const deleteSlide = useCallback((id: string) => onChange(ops.deleteSlide(data, id)), [data, onChange]);
  const reorderSlide = useCallback(
    (fromIndex: number, toIndex: number) => onChange(ops.reorderSlide(data, fromIndex, toIndex)),
    [data, onChange],
  );
  const updateHtml = useCallback((id: string, html: string) => onChange(ops.updateSlideHtml(data, id, html)), [data, onChange]);
  const renameSlide = useCallback((id: string, name: string) => onChange(ops.renameSlide(data, id, name)), [data, onChange]);
  const updateNotes = useCallback(
    (id: string, notes: string) => onChange(ops.updateSlideNotes(data, id, notes)),
    [data, onChange],
  );
  const updateStatus = useCallback(
    (id: string, status: SlideStatus | undefined) => onChange(ops.updateSlideStatus(data, id, status)),
    [data, onChange],
  );
  const updateBackground = useCallback(
    (id: string, color: string | undefined) => onChange(ops.updateSlideBackground(data, id, color)),
    [data, onChange],
  );

  const updateHidden = useCallback((id: string, hidden: boolean) => onChange(ops.updateSlideHidden(data, id, hidden)), [data, onChange]);
  const updateTheme = useCallback((patch: Partial<SlideTheme>) => onChange(ops.updateDeckTheme(data, patch)), [data, onChange]);
  const applyBackgroundToAll = useCallback((color: string) => onChange(ops.applyBackgroundToAllSlides(data, color)), [data, onChange]);
  const toggleSlideNumbers = useCallback(() => onChange(ops.setShowSlideNumbers(data, !data.showSlideNumbers)), [data, onChange]);

  // Present mode walks only the visible slides; hidden ones are skipped.
  const presentData = useMemo<SlideDeckPayload>(() => ({ ...data, slideOrder: ops.presentableSlideOrder(data) }), [data]);

  const startPresenting = useCallback(() => {
    setPresentIndex(ops.presentStartIndex(data, presentData.slideOrder));
    setShowGrid(false);
    setIsPresenting(true);
  }, [data, presentData]);
  const stopPresenting = useCallback(() => setIsPresenting(false), []);
  // Slides can be hidden or deleted by a collaborator while presenting.
  const presentCount = presentData.slideOrder.length;
  const presentIndex = ops.clampPresentIndex(rawPresentIndex, presentCount);
  useEffect(() => {
    if (!isPresenting) return;
    if (presentCount === 0) setIsPresenting(false);
    else if (rawPresentIndex !== presentIndex) setPresentIndex(presentIndex);
  }, [isPresenting, presentCount, rawPresentIndex, presentIndex]);
  const goToIndex = useCallback(
    (index: number) => setPresentIndex(Math.min(Math.max(index, 0), presentData.slideOrder.length - 1)),
    [presentData.slideOrder.length],
  );
  const nextSlide = useCallback(() => goToIndex(presentIndex + 1), [goToIndex, presentIndex]);
  const prevSlide = useCallback(() => goToIndex(presentIndex - 1), [goToIndex, presentIndex]);

  return {
    isPresenting,
    presentIndex,
    showGrid,
    setShowGrid,
    showNotes,
    setShowNotes,
    selectSlide,
    addSlide,
    duplicateSlide,
    deleteSlide,
    reorderSlide,
    updateHtml,
    renameSlide,
    updateNotes,
    updateStatus,
    updateBackground,
    updateHidden,
    updateTheme,
    applyBackgroundToAll,
    toggleSlideNumbers,
    presentData,
    startPresenting,
    stopPresenting,
    goToIndex,
    nextSlide,
    prevSlide,
  };
}
