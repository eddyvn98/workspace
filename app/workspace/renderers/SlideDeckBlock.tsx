"use client";
import { useSlidePresentationRequest } from "../utils/slidePresentationRequest";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import type { SlideSceneHistorySlot } from "../hooks/useSlideSceneHistory";
import { SlidePptxImport } from "../components/slides/SlidePptxImport";
import { appendImportedSlides } from "@/lib/workspace/pptx-import/apply";
import { legacyHtmlToScene } from "../utils/slideLegacyToScene";
import { emptySlideScene } from "../types/slideScene";
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
  const studioRef = useRef<HTMLDivElement>(null);
  const previousStudioState = useRef(false);
  const editHistoryBySlide=useRef<Map<string,SlideSceneHistorySlot>>(new Map());
  useEffect(() => {
    if (!studioOpen) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prior; };
  }, [studioOpen]);
  useEffect(() => {
    if (studioOpen) {
      studioRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Exit Slide Studio"]')?.focus({preventScroll:true});
    } else if (previousStudioState.current) {
      const instance = Array.from(document.querySelectorAll<HTMLElement>("[data-slide-deck-id]"))
        .find(node => node.dataset.slideDeckId === block.id);
      instance?.querySelector<HTMLButtonElement>('button[aria-label="Open Slide Studio"]')?.focus({preventScroll:true});
    }
    previousStudioState.current = studioOpen;
  }, [studioOpen, block.id]);
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
  // A brand-new/empty slide immediately exposes the object ribbon; only populated legacy HTML needs conversion.
  const activeScene = activeSlide?.scene ?? (activeSlide && !activeSlide.html.trim() ? emptySlideScene(data.aspectRatio) : undefined);
  // Studio portal changes the React editor root, but must not discard the user's Undo history.
  let sceneHistory=activeScene?editHistoryBySlide.current.get(activeSlideId):undefined;
  if(activeScene&&!sceneHistory){
    sceneHistory={current:{undo:[],redo:[],expected:JSON.stringify(activeScene)}};
    editHistoryBySlide.current.set(activeSlideId,sceneHistory);
    if(editHistoryBySlide.current.size>12){
      const oldest=editHistoryBySlide.current.keys().next().value;
      if(oldest!==undefined)editHistoryBySlide.current.delete(oldest);
    }
  }

  const filmstrip = <SlideFilmstrip data={data} readOnly={readOnly} orientation={studioOpen ? "vertical" : "horizontal"}
    onSelect={actions.selectSlide} onAdd={actions.addSlide} onReorder={actions.reorderSlide}
    onRename={actions.renameSlide} onDuplicate={actions.duplicateSlide} onDelete={actions.deleteSlide}
    onSetStatus={actions.updateStatus} onSetBackground={actions.updateBackground}
    onSetNotes={actions.updateNotes} onSetHidden={actions.updateHidden} />;
  const editorContent = (
    <div data-slide-deck-id={block.id} className="slide-deck-studio" style={{ width: "100%", height: "100%", boxSizing: "border-box", borderRadius: studioOpen ? "0" : "6px", backgroundColor: "#ffffff",
      border: studioOpen ? "none" : `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
      boxShadow: studioOpen ? "none" : isSelected ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)" : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
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
      <div className={`flex min-h-0 flex-1 ${studioOpen ? "flex-col-reverse lg:flex-row" : "flex-col"}`}>
        {studioOpen && filmstrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {activeSlide && <>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1 text-xs">
          <SlideMotionControls slide={activeSlide} readOnly={readOnly} showContentAnimation={!activeScene}
            onChange={patch=>{if(!readOnly)onChange({slides:{...data.slides,[activeSlide.id]:{...activeSlide,...patch}}});}}/>
          <div className="flex items-center gap-2">
            {activeScene ? <>
              <span className="font-medium text-slate-500">Object editor</span>
              {!readOnly && activeSlide.scene && <details className="relative">
                <summary className="cursor-pointer rounded px-2 py-1 text-slate-500 hover:bg-slate-100">Advanced</summary>
                <div className="absolute right-0 z-30 w-52 rounded border border-slate-200 bg-white p-2 shadow-lg">
                  <button type="button" className="w-full rounded px-2 py-2 text-left text-slate-700 hover:bg-slate-100" onClick={()=>{
                    if(readOnly||!window.confirm("Restore the original HTML slide view? The editable object scene will be removed."))return;
                    const {scene:ignoredScene,...rest}=activeSlide;
                    onChange({slides:{...data.slides,[activeSlide.id]:rest}});
                  }}>Restore original HTML</button>
                </div>
              </details>}
            </> : <>
              <SlideContentTools blockId={block.id} slideId={activeSlide.id} onEdit={startEditingBody}/>
              <button type="button" disabled={readOnly} className="rounded border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50" onClick={()=>{
                if(readOnly)return;
                if(activeSlide.html.trim()&&!window.confirm("Convert legacy HTML to editable slide objects? Existing HTML will be kept as a backup; object positions are approximate."))return;
                onChange({slides:{...data.slides,[activeSlide.id]:{...activeSlide,scene:legacyHtmlToScene(activeSlide.html,data.aspectRatio)}}});
              }}>Convert to objects</button>
            </>}
          </div>
        </div>
      </>}
      <div className="slide-deck-themed slide-cq relative flex-1 overflow-hidden"
        style={{ backgroundColor: slideBackground(activeSlide?.backgroundColor, data.theme), ...slideTextStyle(data.theme) }}
        onClick={(e) => { if (activeScene || e.detail < 2 || isEditingBody) return; e.stopPropagation(); startEditingBody(); }}>
        <style>{THEMED_EDITOR_CSS + SLIDE_TYPOGRAPHY_CSS}</style>
        {data.showSlideNumbers && !activeScene && <span className="pointer-events-none absolute bottom-1 right-2 z-10 text-xs opacity-60">{data.slideOrder.indexOf(activeSlideId) + 1}</span>}
        {activeScene ? <SlideSceneEditor key={activeSlide.id} scene={activeScene} historySlot={sceneHistory} slideNumber={data.showSlideNumbers ? data.slideOrder.indexOf(activeSlideId)+1 : undefined}
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
    <div ref={studioRef} role="dialog" aria-modal="true" aria-label="Slide Studio" data-slide-studio
      className="fixed inset-0 z-[950] bg-slate-100 text-slate-900"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Tab" && studioRef.current?.contains(event.target as Node)) {
          const nodes=Array.from(studioRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
            .filter(node=>node.getClientRects().length>0);
          const first=nodes[0],last=nodes[nodes.length-1];
          if(first&&last&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
          else if(first&&last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
        if (event.key === "Escape" && !event.defaultPrevented && studioRef.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) {
          event.stopPropagation(); setStudioOpen(false);
        }
      }}>
      {editorContent}
    </div>, document.body);
};
registerBlockRenderer("slideDeck", SlideDeckBlock);
