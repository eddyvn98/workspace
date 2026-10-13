"use client";

import { Check, ChevronRight, Plus } from "lucide-react";
import type { MapLayoutSettings } from "@/app/workspace/types/block";
import {
  STRUCTURES,
  directionOptions,
  displayFamily,
  lineOptions,
  supportsMapDirection,
  type WorkspaceMapLayoutCreateKind,
  type WorkspaceMapLayoutDirection,
  type WorkspaceMapLayoutFamily,
  type WorkspaceMapLayoutGrowthMode,
} from "@/app/workspace/utils/layout";
import { WORKSPACE_MAP_LAYOUT_PALETTES, type WorkspaceMapLayoutPalette } from "@/app/workspace/utils/layout";
import {
  WorkspaceMapLayoutDirectionThumbnail,
  WorkspaceMapLayoutLineStyleThumbnail,
  WorkspaceMapLayoutStructureIcon,
  WorkspaceMapLayoutTimelineThumbnail,
} from "./WorkspaceMapLayoutOptionIcons";

export interface WorkspaceMapLayoutStageActions {
  onChange: (patch: Partial<MapLayoutSettings>) => void;
  onPreviewFamily: (family: WorkspaceMapLayoutFamily) => void;
  onOpenStage: (stage: "direction" | "line" | "palette") => void;
  isCascade: boolean;
  setOpenThrough: (stage: number) => void;
  /** Non-null while a structure switch is being configured. In create mode,
   *  Direction/Line/Color all edit this draft and nothing happens until
   *  commitPendingDraft() (the Color stage's "Create map" button) - the left
   *  bar needs the full type+direction+line+color flow since it's seeding a
   *  brand-new map. In edit mode it only lives between picking a new
   *  Structure and picking a Direction - direction commits it immediately via
   *  commitPendingDraftWithPatch (no need to re-pick line/color: those keep
   *  whatever the map already had). */
  pendingDraft: MapLayoutSettings | null;
  isCreateMode: boolean;
  beginPendingSwitch: (option: { id: WorkspaceMapLayoutCreateKind; family: WorkspaceMapLayoutFamily }) => void;
  updatePendingDraft: (patch: Partial<MapLayoutSettings>) => void;
  commitPendingDraft: () => void;
  /** Edit mode only: merge patch into the pending draft and apply it to the
   *  live map right away (Direction is the last thing the floating toolbar's
   *  in-place structure switch needs). */
  commitPendingDraftWithPatch: (patch: Partial<MapLayoutSettings>) => void;
  /** Edit mode only: apply a structure switch immediately for a family with
   *  no Direction step (e.g. Fishbone) - there's nothing left to pick. */
  commitStructureSwitch: (option: { id: WorkspaceMapLayoutCreateKind; family: WorkspaceMapLayoutFamily }) => void;
}

export function WorkspaceMapLayoutStructureContent({
  settings,
  previewFamily,
  mode,
  onCreateNewMap,
  actions,
  structures = STRUCTURES,
}: {
  settings: MapLayoutSettings;
  previewFamily: WorkspaceMapLayoutFamily;
  mode: "create" | "edit";
  onCreateNewMap?: (kind: WorkspaceMapLayoutCreateKind) => void;
  actions: WorkspaceMapLayoutStageActions;
  /** Restrict which structures this picker offers - e.g. the selection
   *  toolbar's in-place "convert this map" picker only offers the mind-map
   *  families (Hierarchy..Fishbone): Flowchart/Swimlane use decision
   *  branches and merges that don't convert in place. */
  structures?: readonly (typeof STRUCTURES)[number][];
}) {
  const activeFamily = displayFamily(settings.family);
  const isCreateMode = mode === "create";
  return (
    <div className="flex flex-col gap-1">
      {structures.map((option) => {
        const selected = !isCreateMode && activeFamily === option.family;
        const previewed = !isCreateMode && previewFamily === option.family;
        const navigate = () => {
          if (isCreateMode) {
            // Flowchart seeds from a fixed starter template (Start → Process
            // → Decision → Yes/No, see workflowTemplate()) with its own
            // canonical direction/line/color already baked in - there is
            // nothing left to ask, so create it immediately instead of
            // opening the type+direction+line+color flow the other families
            // need to build a blank map from scratch.
            if (option.family === "flowchart") {
              onCreateNewMap?.(option.id);
              return;
            }
            // Seeding a brand-new map: nothing exists yet to fall back on, so
            // the full type+direction+line+color flow is required before
            // WorkspaceMapLayoutPaletteContent's "Create map" button fires.
            actions.beginPendingSwitch(option);
            actions.onPreviewFamily(option.family);
            if (actions.isCascade) actions.setOpenThrough(1);
            actions.onOpenStage(option.family === "fishbone" ? "palette" : "direction");
            return;
          }
          if (selected) {
            // Already the current family - nothing to switch, just reveal
            // the cascade so Direction/Line/Color can be tweaked live.
            actions.onPreviewFamily(option.family);
            if (actions.isCascade) actions.setOpenThrough(1);
            actions.onOpenStage(option.family === "fishbone" ? "palette" : "direction");
            return;
          }
          // Switching an existing map to a different family: the map already
          // has a line style/color, so only type+direction matter here.
          if (supportsMapDirection(option.family)) {
            actions.beginPendingSwitch(option);
            actions.onPreviewFamily(option.family);
            if (actions.isCascade) actions.setOpenThrough(1);
            actions.onOpenStage("direction");
          } else {
            // No Direction step for this family (e.g. Fishbone) - there's
            // nothing left to pick, so apply the switch right away.
            actions.commitStructureSwitch(option);
          }
        };
        const createClass = "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800";
        const editClass = `flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[10px] font-medium transition-colors ${selected ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-950/30 dark:text-orange-300" : previewed ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`;
        return (
          <button key={option.id} type="button" onMouseEnter={() => { if (actions.isCascade && !isCreateMode) { actions.onPreviewFamily(option.family); actions.setOpenThrough(1); } }} onFocus={() => { if (actions.isCascade && !isCreateMode) { actions.onPreviewFamily(option.family); actions.setOpenThrough(1); } }} onClick={navigate} className={isCreateMode ? createClass : editClass}>
            <span className={isCreateMode ? "h-4 w-5 shrink-0 text-slate-500 dark:text-slate-400" : "flex h-5 w-8 shrink-0 items-center justify-center"}><WorkspaceMapLayoutStructureIcon family={option.family} compact={isCreateMode} /></span>
            <span>{option.label}</span>
            {selected ? <Check className="ml-auto h-3 w-3 text-orange-500" /> : isCreateMode ? <Plus className="ml-auto h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="ml-auto h-3 w-3 text-slate-400" />}
          </button>
        );
      })}
    </div>
  );
}

export function WorkspaceMapLayoutDirectionContent({
  settings,
  previewFamily,
  previewDirection,
  resolvedTimelineBranchMode,
  onChange,
  actions,
}: {
  settings: MapLayoutSettings;
  previewFamily: WorkspaceMapLayoutFamily;
  previewDirection: WorkspaceMapLayoutDirection;
  resolvedTimelineBranchMode?: Exclude<MapLayoutSettings["timelineBranchMode"], "auto">;
  onChange: (patch: Partial<MapLayoutSettings>) => void;
  actions: WorkspaceMapLayoutStageActions;
}) {
  const activeFamily = displayFamily(settings.family);
  const options = directionOptions(previewFamily, settings.growthMode);
  const selectedDirection = settings.direction;
  const applyPatch = (patch: Partial<MapLayoutSettings>) => {
    if (!actions.pendingDraft) { onChange(patch); return; }
    // Create mode keeps staging (Line/Color still need picking before the
    // "Create map" button). Edit mode's pending draft only exists to wait for
    // Direction, so this IS that final pick - apply it now.
    if (actions.isCreateMode) actions.updatePendingDraft(patch);
    else actions.commitPendingDraftWithPatch(patch);
  };
  const setDirection = (direction: WorkspaceMapLayoutDirection) => {
    // Edit mode's pending draft commits right here - there's no Line/Color
    // stage to advance to (and applyPatch already reset the stage back to
    // Structure), so only create mode still has a next stage to reveal.
    const willAdvanceStage = !actions.pendingDraft || actions.isCreateMode;
    applyPatch({ family: previewFamily === "orgchart" ? "hierarchy" : previewFamily, direction, layoutAngle: undefined });
    if (!willAdvanceStage) return;
    if (actions.isCascade) actions.setOpenThrough(2);
    actions.onOpenStage(lineOptions(previewFamily).length > 0 ? "line" : "palette");
  };
  const setGrowthMode = (growthMode: WorkspaceMapLayoutGrowthMode) => applyPatch({ family: "hierarchy" as const, growthMode });
  return (
    <div>
      {previewFamily === "hierarchy" && <GrowthModePicker mode={settings.growthMode} onChange={setGrowthMode} />}
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => {
          const selected = activeFamily === previewFamily && (settings.growthMode === "both-side"
            ? option.id === "right" ? selectedDirection === "right" || selectedDirection === "left" : selectedDirection === "down" || selectedDirection === "up"
            : selectedDirection === option.id);
          return <button key={option.id} type="button" onMouseEnter={() => { if (actions.isCascade) { actions.setOpenThrough(2); } }} onFocus={() => { if (actions.isCascade) { actions.setOpenThrough(2); } }} onClick={() => setDirection(option.id)} aria-label={`${option.label} direction`} className={`relative flex flex-col items-center rounded-lg border p-1 text-[10px] ${selected ? "border-orange-400 bg-orange-50 text-orange-600 dark:bg-orange-950/30" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            <WorkspaceMapLayoutDirectionThumbnail family={previewFamily} direction={option.id} growthMode={previewFamily === "hierarchy" ? settings.growthMode : undefined} />
            <span>{option.label}</span>
          </button>;
        })}
      </div>
      {activeFamily === "timeline" && <TimelineDetails settings={settings} resolvedBranchMode={resolvedTimelineBranchMode} axis={previewDirection === "up" || previewDirection === "down" ? "vertical" : "horizontal"} onChange={applyPatch} />}
      {activeFamily === "treeview" && previewFamily === "treeview" && <CatalogDetails settings={settings} onChange={applyPatch} />}
    </div>
  );
}

function GrowthModePicker({ mode, onChange }: { mode: WorkspaceMapLayoutGrowthMode; onChange: (mode: WorkspaceMapLayoutGrowthMode) => void }) {
  return <div className="mb-2 grid grid-cols-2 gap-1 border-b border-slate-100 pb-2 dark:border-slate-800">{(["one-side", "both-side"] as const).map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-md px-1.5 py-1 text-[10px] ${mode === option ? "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "bg-slate-50 text-slate-500 dark:bg-slate-800"}`}>{option === "one-side" ? "One side" : "Both side"}</button>)}</div>;
}

function TimelineDetails({ settings, resolvedBranchMode, axis, onChange }: { settings: MapLayoutSettings; resolvedBranchMode?: Exclude<MapLayoutSettings["timelineBranchMode"], "auto">; axis: "horizontal" | "vertical"; onChange: (patch: Partial<MapLayoutSettings>) => void }) {
  const modes = axis === "vertical"
    ? [["one-side", "Left", "Keep every detail on the left of the spine."], ["one-side-reverse", "Right", "Keep every detail on the right of the spine."], ["alternate", "Both side", "Balance milestone details across both sides."]] as const
    : [["one-side", "Up", "Keep every detail above the spine."], ["one-side-reverse", "Down", "Keep every detail below the spine."], ["alternate", "Both side", "Balance milestone details above and below."]] as const;
  const selectedMode = resolvedBranchMode ?? (settings.timelineBranchMode === "auto" ? "one-side" : settings.timelineBranchMode);
  return <section className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800"><p className="mb-1.5 text-[10px] font-semibold text-slate-500">Timeline details</p><div className="grid grid-cols-2 gap-1">{modes.map(([id, label, description]) => <button key={id} type="button" title={description} onClick={() => onChange({ timelineBranchMode: id })} className={`rounded-md border px-1 py-1 text-left text-[10px] ${selectedMode === id ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}><WorkspaceMapLayoutTimelineThumbnail mode={id} /><span className="block font-medium">{label}</span></button>)}</div><DetailToggle label="Activity levels" value={settings.timelineDescendantStyle} onChange={(value) => onChange({ timelineDescendantStyle: value })} /></section>;
}

function CatalogDetails({ settings, onChange }: { settings: MapLayoutSettings; onChange: (patch: Partial<MapLayoutSettings>) => void }) {
  return <DetailToggle label="Branch levels" firstOptionLabel="Stacked" firstOptionTitle="Every level stacks in one downward column, like today." secondOptionTitle="From level 1 down, a parent sits centered on its children, wired right-edge to left-edge." value={settings.catalogDescendantStyle} onChange={(value) => onChange({ catalogDescendantStyle: value })} />;
}

function DetailToggle({ label, firstOptionLabel = "Tree", firstOptionTitle = "Activities stack in a treeview column, like today.", secondOptionTitle = "From the activity level down, grow right-edge to left-edge like Hierarchy." , value, onChange }: { label: string; firstOptionLabel?: string; firstOptionTitle?: string; secondOptionTitle?: string; value: "tree" | "hierarchy"; onChange: (value: "tree" | "hierarchy") => void }) {
  const options = [{ id: "tree" as const, label: firstOptionLabel, title: firstOptionTitle }, { id: "hierarchy" as const, label: "Hierarchy", title: secondOptionTitle }];
  return <section className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800"><p className="mb-1.5 text-[10px] font-semibold text-slate-500">{label}</p><div className="grid grid-cols-2 gap-1">{options.map((option) => <button key={option.id} type="button" title={option.title} onClick={() => onChange(option.id)} className={`rounded-md border px-1.5 py-1 text-left text-[10px] ${value === option.id ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}><div className="flex h-8 items-center justify-center"><div className="scale-75"><WorkspaceMapLayoutDirectionThumbnail family={option.id === "tree" ? "treeview" : "hierarchy"} direction="right" /></div></div><span className="block font-medium">{option.label}</span></button>)}</div></section>;
}

export function WorkspaceMapLayoutLineContent({ settings, previewFamily, actions, onChange }: { settings: MapLayoutSettings; previewFamily: WorkspaceMapLayoutFamily; actions: WorkspaceMapLayoutStageActions; onChange: (patch: Partial<MapLayoutSettings>) => void }) {
  const options = lineOptions(previewFamily);
  const selectLine = (lineId: MapLayoutSettings["connectorLineType"]) => {
    const patch = { connectorLineType: lineId };
    if (actions.pendingDraft) actions.updatePendingDraft(patch); else onChange(patch);
    if (actions.isCascade) actions.setOpenThrough(3);
    actions.onOpenStage("palette");
  };
  return <div className="flex flex-col gap-1.5">{options.map((line) => <button key={line.id} type="button" onMouseEnter={() => { if (actions.isCascade) actions.setOpenThrough(3); }} onFocus={() => { if (actions.isCascade) actions.setOpenThrough(3); }} onClick={() => selectLine(line.id)} className={`flex items-center gap-2 rounded-lg border px-1.5 py-1 text-[10px] ${settings.connectorLineType === line.id ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}><WorkspaceMapLayoutLineStyleThumbnail style={line.id} /><span>{line.label}</span></button>)}</div>;
}

export function WorkspaceMapLayoutPaletteContent({ settings, actions, onChange }: { settings: MapLayoutSettings; actions: WorkspaceMapLayoutStageActions; onChange: (patch: Partial<MapLayoutSettings>) => void }) {
  const selectPalette = (paletteId: string) => {
    const patch = { connectorPaletteId: paletteId, stylePresetId: paletteId };
    if (actions.pendingDraft) actions.updatePendingDraft(patch); else onChange(patch);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
        {WORKSPACE_MAP_LAYOUT_PALETTES.map((palette) => <PaletteOption key={palette.id} palette={palette} selected={settings.connectorPaletteId === palette.id} onClick={() => selectPalette(palette.id)} />)}
      </div>
      {actions.pendingDraft && (
        <button
          type="button"
          onClick={actions.commitPendingDraft}
          className="mt-1 w-full rounded-lg bg-orange-500 px-2.5 py-1.5 text-center text-[11px] font-semibold text-white transition-colors hover:bg-orange-600"
        >
          {actions.isCreateMode ? "Create map" : "Apply"}
        </button>
      )}
    </div>
  );
}

function PaletteOption({ palette, selected, onClick }: { palette: WorkspaceMapLayoutPalette; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selected ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}><span className="flex gap-0.5">{palette.colors.slice(0, 5).map((color, index) => <i key={`${palette.id}-${index}`} className="h-3 w-3 rounded-full" style={{ background: color }} />)}</span><span className="min-w-0 flex-1 truncate">{palette.name}</span>{selected && <Check className="h-3 w-3 shrink-0 text-orange-500" />}</button>;
}
