"use client";
import { useSlidePresentationRequest } from "../utils/slidePresentationRequest";
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { SlidePptxImport } from "../components/slides/SlidePptxImport";
import { appendImportedSlides } from "@/lib/workspace/pptx-import/apply";
import { legacyHtmlToScene } from "../utils/slideLegacyToScene";
import { slideBackground, slideTextStyle } from "../utils/slideTheme";
import { SLIDE_TYPOGRAPHY_CSS } from "../utils/slideTypography";

const THEMED_EDITOR_CSS = ".slide-deck-themed .workspace-doc-rich-editor .ProseMirror { color: inherit; font-family: inherit; }";

/** Legacy rich-text and editable Scene V2 share the same Workspace persistence and permissions. */
export const SlideDeckBlock: React.FC<BlockRendererProps<"slideDeck">> = ({ block, isSelected, onChange, readOnly = false }) => {
  const data = normalizeSlideDeckData(block.data);
  const actions = useSlideDeckActions(data, (patch) => { if (!readOnly) onChange(patch); });
  useSlidePresentationRequest(block.id, actions.startPresenting);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  useEffect(() => {
    if (!studioOpen) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prior; };
  }, [studioOpen]);
  const boardId = useWorkspaceStore(state => state.boardId);
  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);
  const startEditingBody = useCallback(() => {
    if (readOnly) return;
    useWorkspaceStore.getState().setSelection([block.id]);
    setIsEditingBody(true); setEditingBlockId(block.id);
  }, [block.id, readOnly, setEditingBlockId]);
  const stopEditingBody = useCallback(() => {
    setIsEditingBody(false);
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);
  useEffect(() => {
    if (pendingEditBlockId === block.id) { startEditingBody(); setPendingEditBlockId(null); }
  }, [pendingEditBlockId, block.id, setPendingEditBlockId, startEditingBody]);
  useEffect(() => { if (!isSelected && isEditingBody) stopEditingBody(); }, [isSelected, isEditingBody, stopEditingBody]);
  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);
  const activeSlideId = data.activeSlideId ?? data.slideOrder[0];
  const activeSlide = data.slides[activeSlideId];

  const filmstrip = <SlideFilmstrip data={data} orientation={studioOpen ? "vertical" : "horizontal"}
    onSelect={actions.selectSlide} onAdd={actions.addSlide} onReorder={actions.reorderSlide}
    onRename={actions.renameSlide} onDuplicate={actions.duplicateSlide} onDelete={actions.deleteSlide}
    onSetStatus={actions.updateStatus} onSetBackground={actions.updateBackground}
    onSetNotes={actions.updateNotes} onSetHidden={actions.updateHidden} />;
  const editorContent = (
    <div className="slide-deck-studio" style={{ width: "100%", height: "100%", boxSizing: "border-box", borderRadius: studioOpen ? "0" : "6px", backgroundColor: "#ffffff",
      border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
      boxShadow: isSelected ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)" : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
      overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <SlideDeckToolbar blockId={block.id} title={data.title} aspectRatio={data.aspectRatio ?? "16:9"}
        studioOpen={studioOpen} onToggleStudio={() => setStudioOpen(v => !v)}
        slideCount={data.slideOrder.length} theme={data.theme} readOnly={readOnly}
        showSlideNumbers={data.showSlideNumbers === true}
        onChangeAspectRatio={(aspectRatio) => { if (!readOnly) onChange({ aspectRatio }); }}
        onChangeTheme={actions.updateTheme} onApplyBackgroundToAll={actions.applyBackgroundToAll}
        onToggleSlideNumbers={actions.toggleSlideNumbers} onPresent={actions.startPresenting}
        extraControls={<SlidePptxImport key={`${boardId}:${block.id}`} data={data} readOnly={readOnly}
          onAppend={(slides, expected, ratio) => {
            // Re-read the store at commit time; async uploads must not overwrite newer edits or another board.
            const state = useWorkspaceStore.getState(), live = state.blocks[block.id];
            if (readOnly || state.isReadOnly || state.boardId !== boardId || live?.type !== "slideDeck") {
              throw new Error("This presentation is no longer editable. Nothing was inserted.");
            }
            const current = normalizeSlideDeckData(live.data as typeof data);
            onChange(appendImportedSlides(current, expected, ratio, slides));
          }} />}
      />
      <div className={`flex min-h-0 flex-1 ${studioOpen ? "flex-row" : "flex-col"}`}>
        {studioOpen && filmstrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {activeSlide && <>
        <SlideMotionControls slide={activeSlide} onChange={(patch) => { if (!readOnly) onChange({ slides: { ...data.slides, [activeSlide.id]: { ...activeSlide, ...patch } } }); }} />
        <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
          <button type="button" disabled={readOnly || !!activeSlide.scene} className="rounded border px-2 py-1" onClick={() => {
            if (readOnly || activeSlide.scene) return;
            if (activeSlide.html.trim() && !window.confirm("Convert legacy content to editable V2 objects? Layout is approximate; the original HTML remains saved as backup.")) return;
            onChange({ slides: { ...data.slides, [activeSlide.id]: { ...activeSlide, scene: legacyHtmlToScene(activeSlide.html, data.aspectRatio) } } });
          }}>{activeSlide.scene ? "Scene V2" : "Enable Scene V2"}</button>
          {activeSlide.scene && <button type="button" disabled={readOnly} className="rounded border px-2 py-1" onClick={() => {
            if (readOnly || !window.confirm("Restore the original HTML slide view? The V2 scene on this slide will be removed.")) return;
            const { scene: ignoredScene, ...rest } = activeSlide;
            onChange({ slides: { ...data.slides, [activeSlide.id]: rest } });
          }}>Restore HTML</button>}
          {!activeSlide.scene && <SlideContentTools blockId={block.id} slideId={activeSlide.id} onEdit={startEditingBody} />}
        </div>
      </>}
      <div className="slide-deck-themed slide-cq relative flex-1 overflow-hidden"
        style={{ backgroundColor: slideBackground(activeSlide?.backgroundColor, data.theme), ...slideTextStyle(data.theme) }}
        onClick={(e) => { if (activeSlide?.scene || e.detail < 2 || isEditingBody) return; e.stopPropagation(); startEditingBody(); }}>
        <style>{THEMED_EDITOR_CSS + SLIDE_TYPOGRAPHY_CSS}</style>
        {data.showSlideNumbers && <span className="pointer-events-none absolute bottom-1 right-2 z-10 text-xs opacity-60">{data.slideOrder.indexOf(activeSlideId) + 1}</span>}
        {activeSlide?.scene ? <SlideSceneEditor key={activeSlide.id} scene={activeSlide.scene}
          backgroundColor={slideBackground(activeSlide.backgroundColor, data.theme)} readOnly={readOnly}
          onChange={scene => { if (!readOnly) onChange({ slides: { ...data.slides, [activeSlide.id]: { ...activeSlide, scene } } }); }} />
          : activeSlide && <WorkspaceDocRichEditor key={activeSlide.id} blockId={block.id} html={activeSlide.html}
            isEditing={isEditingBody && !readOnly} readOnly={readOnly} onChange={(next) => actions.updateHtml(activeSlide.id, next)} onStopEditing={stopEditingBody} />}
      </div>
        </div>
      </div>
      {!studioOpen && filmstrip}
      {actions.isPresenting && <SlidePresentOverlay data={actions.presentData} index={actions.presentIndex}
        showGrid={actions.showGrid} showNotes={actions.showNotes} onToggleGrid={() => actions.setShowGrid((v) => !v)}
        onToggleNotes={() => actions.setShowNotes((v) => !v)} onNext={actions.nextSlide} onPrev={actions.prevSlide}
        onJump={actions.goToIndex} onExit={actions.stopPresenting} />}
    </div>
  );
  if (!studioOpen || typeof document === "undefined") return editorContent;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Slide Studio" data-slide-studio
      className="fixed inset-0 z-[1050] bg-slate-100 text-slate-900"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.defaultPrevented && !(event.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) {
          event.stopPropagation(); setStudioOpen(false);
        }
      }}>
      {editorContent}
    </div>, document.body);
};
registerBlockRenderer("slideDeck", SlideDeckBlock);
