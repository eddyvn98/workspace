"use client";
import { useSlidePresentationRequest } from "../utils/slidePresentationRequest";

import React, { useCallback, useEffect, useState } from "react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { WorkspaceDocRichEditor } from "./WorkspaceDocRichEditor";
import { normalizeSlideDeckData } from "../utils/slideDeckOps";
import { useSlideDeckActions } from "../hooks/useSlideDeckActions";
import { SlideMotionControls } from "../components/slides/SlideMotionControls";
import { SlideContentTools } from "../components/slides/SlideContentTools";
import { SlideDeckToolbar } from "../components/slides/SlideDeckToolbar";
import { SlideFilmstrip } from "../components/slides/SlideFilmstrip";
import { SlidePresentOverlay } from "../components/slides/SlidePresentOverlay";
import { SlideSceneEditor } from "../components/slides/SlideSceneEditor";
import { emptySlideScene } from "../types/slideScene";
import { slideBackground, slideTextStyle } from "../utils/slideTheme";
import { SLIDE_TYPOGRAPHY_CSS } from "../utils/slideTypography";

const THEMED_EDITOR_CSS = ".slide-deck-themed .workspace-doc-rich-editor .ProseMirror { color: inherit; font-family: inherit; }";

/** A Miro-Slides-style presentation deck: an ordered list of slides, each a
 *  rich-text body (same editor the "doc" block uses), with per-slide status/
 *  notes/background, filmstrip drag-reorder, and a fullscreen Present mode.
 *  See types/slide.ts for the deliberate scope note on why this isn't a
 *  free-form nested canvas. */
export const SlideDeckBlock: React.FC<BlockRendererProps<"slideDeck">> = ({ block, isSelected, onChange, readOnly = false }) => {
  const data = normalizeSlideDeckData(block.data);
  const actions = useSlideDeckActions(data, (patch) => { if (!readOnly) onChange(patch); });
  useSlidePresentationRequest(block.id, actions.startPresenting);
  const [isEditingBody, setIsEditingBody] = useState(false);

  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);

  const startEditingBody = useCallback(() => {
    if (readOnly) return;
    useWorkspaceStore.getState().setSelection([block.id]);
    setIsEditingBody(true);
    setEditingBlockId(block.id);
  }, [block.id, readOnly, setEditingBlockId]);
  const stopEditingBody = useCallback(() => {
    setIsEditingBody(false);
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);

  useEffect(() => {
    if (pendingEditBlockId === block.id) {
      startEditingBody();
      setPendingEditBlockId(null);
    }
  }, [pendingEditBlockId, block.id, setPendingEditBlockId, startEditingBody]);
  useEffect(() => {
    if (!isSelected && isEditingBody) stopEditingBody();
  }, [isSelected, isEditingBody, stopEditingBody]);
  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);

  const activeSlideId = data.activeSlideId ?? data.slideOrder[0];
  const activeSlide = data.slides[activeSlideId];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
        boxShadow: isSelected ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)" : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SlideDeckToolbar
        blockId={block.id}
        title={data.title}
        aspectRatio={data.aspectRatio ?? "16:9"}
        slideCount={data.slideOrder.length}
        theme={data.theme}
        showSlideNumbers={data.showSlideNumbers === true}
        onChangeAspectRatio={(aspectRatio) => onChange({ aspectRatio })}
        onChangeTheme={actions.updateTheme}
        onApplyBackgroundToAll={actions.applyBackgroundToAll}
        onToggleSlideNumbers={actions.toggleSlideNumbers}
        onPresent={actions.startPresenting}
      />

      {activeSlide && <>
        <SlideMotionControls slide={activeSlide} onChange={(patch) => onChange({ slides: { ...data.slides, [activeSlide.id]: { ...activeSlide, ...patch } } })} />
        <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
          <button type="button" disabled={readOnly || !!activeSlide.scene} className="rounded border px-2 py-1" onClick={() => {
            if (activeSlide.scene) return;
            if (activeSlide.html.trim() && !window.confirm("Switch to Scene V2? Existing rich text stays stored but Scene V2 becomes the visible slide.")) return;
            onChange({ slides: { ...data.slides, [activeSlide.id]: { ...activeSlide, scene: emptySlideScene(data.aspectRatio) } } });
          }}>{activeSlide.scene ? "Scene V2" : "Enable Scene V2"}</button>
          {!activeSlide.scene && <SlideContentTools blockId={block.id} slideId={activeSlide.id} onEdit={startEditingBody} />}
        </div>
      </>}
      <div
        className="slide-deck-themed slide-cq relative flex-1 overflow-hidden"
        style={{ backgroundColor: slideBackground(activeSlide?.backgroundColor, data.theme), ...slideTextStyle(data.theme) }}
        onClick={(e) => {
          if (e.detail < 2 || isEditingBody) return;
          e.stopPropagation();
          startEditingBody();
        }}
      >
        <style>{THEMED_EDITOR_CSS + SLIDE_TYPOGRAPHY_CSS}</style>
        {data.showSlideNumbers && (
          <span className="pointer-events-none absolute bottom-1 right-2 z-10 text-xs opacity-60">{data.slideOrder.indexOf(activeSlideId) + 1}</span>
        )}
        {activeSlide?.scene ? (
          <SlideSceneEditor key={activeSlide.id} scene={activeSlide.scene} readOnly={readOnly} onChange={scene => onChange({slides:{...data.slides,[activeSlide.id]:{...activeSlide,scene}}})}/>
        ) : activeSlide && (
          <WorkspaceDocRichEditor
            key={activeSlide.id}
            blockId={block.id}
            html={activeSlide.html}
            isEditing={isEditingBody && !readOnly}
            onChange={(next) => actions.updateHtml(activeSlide.id, next)}
            onStopEditing={stopEditingBody}
          />
        )}
      </div>

      <SlideFilmstrip
        data={data}
        onSelect={actions.selectSlide}
        onAdd={actions.addSlide}
        onReorder={actions.reorderSlide}
        onRename={actions.renameSlide}
        onDuplicate={actions.duplicateSlide}
        onDelete={actions.deleteSlide}
        onSetStatus={actions.updateStatus}
        onSetBackground={actions.updateBackground}
        onSetNotes={actions.updateNotes}
        onSetHidden={actions.updateHidden}
      />

      {actions.isPresenting && (
        <SlidePresentOverlay
          data={actions.presentData}
          index={actions.presentIndex}
          showGrid={actions.showGrid}
          showNotes={actions.showNotes}
          onToggleGrid={() => actions.setShowGrid((v) => !v)}
          onToggleNotes={() => actions.setShowNotes((v) => !v)}
          onNext={actions.nextSlide}
          onPrev={actions.prevSlide}
          onJump={actions.goToIndex}
          onExit={actions.stopPresenting}
        />
      )}
    </div>
  );
};

registerBlockRenderer("slideDeck", SlideDeckBlock);
