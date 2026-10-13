"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MapLayoutSettings } from "@/app/workspace/types/block";
import {
  DIRECTION_WIDTH,
  FLYOUT_GAP,
  LINE_WIDTH,
  PALETTE_WIDTH,
  STRUCTURE_WIDTH,
  WorkspaceMapLayoutColumn,
  WorkspaceMapLayoutCompact,
  WorkspaceMapLayoutFlyoutColumn,
  type WorkspaceMapLayoutStage,
} from "./WorkspaceMapLayoutColumns";
import {
  defaultConnectorLineTypeFor,
  defaultMapDirection,
  displayFamily,
  growthModeForFamilySwitch,
  supportsMapDirection,
  supportsMapLineStyle,
  type WorkspaceMapLayoutCreateKind,
  type WorkspaceMapLayoutFamily,
  type WorkspaceMapLayoutStructureOption,
} from "@/app/workspace/utils/layout";
import { resolveWorkspaceMapLayoutPresentation, type WorkspaceMapLayoutPresentation } from "@/app/workspace/utils/layout";
import {
  WorkspaceMapLayoutDirectionContent,
  WorkspaceMapLayoutLineContent,
  WorkspaceMapLayoutPaletteContent,
  WorkspaceMapLayoutStructureContent,
} from "./WorkspaceMapLayoutStageContent";
import type { WorkspaceMapLayoutStageActions } from "./WorkspaceMapLayoutStageContent";

export interface WorkspaceMapLayoutPickerProps {
  settings: MapLayoutSettings;
  resolvedTimelineBranchMode?: Exclude<MapLayoutSettings["timelineBranchMode"], "auto">;
  onChange: (patch: Partial<MapLayoutSettings>) => void;
  onCreateNewMap?: (kind: WorkspaceMapLayoutCreateKind, layoutOverrides?: Partial<MapLayoutSettings>) => void;
  mode?: "create" | "edit";
  /** Restrict which structures are offered - see WorkspaceMapLayoutStructureContent. */
  structures?: readonly WorkspaceMapLayoutStructureOption[];
  /** Always render the single-stage "compact" layout instead of measuring
   *  available width for a side-by-side cascade. The cascade's Direction/
   *  Line/Color flyouts are absolutely positioned and only clamped to the
   *  window, not to whatever scrollable container the picker itself sits in
   *  - inside a host that clips/scrolls its own content (e.g. the selection
   *  toolbar's WorkspaceSmartPopover, which forces overflow-x once it has
   *  overflow-y), a flyout can render outside the visible/clickable area.
   *  Compact mode has no such flyouts, so it's always safe there. */
  forceCompact?: boolean;
}

interface PendingMapLayoutDraft {
  kind: WorkspaceMapLayoutCreateKind;
  settings: MapLayoutSettings;
}

/** Starting point for the draft opened by picking a new structure: keeps
 *  whatever the base (current map, or last-used tree defaults) already had
 *  except for the fields that meaningfully change with the family. */
function draftForStructure(option: { family: WorkspaceMapLayoutFamily }, base: MapLayoutSettings): MapLayoutSettings {
  return {
    ...base,
    family: option.family,
    direction: defaultMapDirection(option.family) ?? base.direction,
    growthMode: growthModeForFamilySwitch(base.family, option.family, base.growthMode),
    connectorLineType: defaultConnectorLineTypeFor(option.family),
  };
}

export function WorkspaceMapLayoutPicker({
  settings,
  resolvedTimelineBranchMode,
  onChange,
  onCreateNewMap,
  mode = "edit",
  structures,
  forceCompact = false,
}: WorkspaceMapLayoutPickerProps) {
  const activeFamily = displayFamily(settings.family);
  const [previewFamily, setPreviewFamily] = useState<WorkspaceMapLayoutFamily>(activeFamily);
  const [openThrough, setOpenThrough] = useState(0);
  const [compactStage, setCompactStage] = useState<WorkspaceMapLayoutStage>("structure");
  const [presentation, setPresentation] = useState<WorkspaceMapLayoutPresentation | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingMapLayoutDraft | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPreviewFamily(activeFamily), [activeFamily]);
  useLayoutEffect(() => {
    if (forceCompact) {
      setPresentation({ mode: "compact" });
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const cascadeWidth = FLYOUT_GAP * 3 + DIRECTION_WIDTH + LINE_WIDTH + PALETTE_WIDTH;
    const updatePresentation = () => {
      const rect = root.getBoundingClientRect();
      const next = resolveWorkspaceMapLayoutPresentation({ rootLeft: rect.left, rootRight: rect.right, viewportWidth: window.innerWidth, cascadeWidth });
      setPresentation(next);
      if (next.mode === "compact") setCompactStage("structure");
    };
    updatePresentation();
    window.addEventListener("resize", updatePresentation);
    return () => window.removeEventListener("resize", updatePresentation);
  }, [forceCompact]);

  const isCascade = presentation?.mode === "cascade";
  const hasDirection = supportsMapDirection(previewFamily);
  const hasLineStyle = supportsMapLineStyle(previewFamily);
  const lineStage = hasDirection ? 2 : 1;
  const paletteStage = lineStage + (hasLineStyle ? 1 : 0);
  // While a structure switch is being configured, Direction/Line/Color read
  // and write the unconfirmed draft instead of the live map - nothing is
  // created/applied until commitPendingDraft fires.
  const effectiveSettings = pendingDraft?.settings ?? settings;
  const previewDirection = previewFamily === activeFamily && hasDirection
    ? effectiveSettings.direction
    : defaultMapDirection(previewFamily);
  const actions: WorkspaceMapLayoutStageActions = {
    onChange,
    onPreviewFamily: setPreviewFamily,
    onOpenStage: (stage) => { if (!isCascade) setCompactStage(stage); },
    isCascade: Boolean(isCascade),
    setOpenThrough: (stage) => setOpenThrough((current) => Math.max(current, stage)),
    pendingDraft: pendingDraft?.settings ?? null,
    isCreateMode: mode === "create",
    beginPendingSwitch: (option) => setPendingDraft({ kind: option.id, settings: draftForStructure(option, settings) }),
    updatePendingDraft: (patch) => setPendingDraft((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current)),
    commitPendingDraft: () => {
      if (!pendingDraft) return;
      if (mode === "create") onCreateNewMap?.(pendingDraft.kind, pendingDraft.settings);
      else onChange(pendingDraft.settings);
      setPendingDraft(null);
      setOpenThrough(0);
      setCompactStage("structure");
    },
    commitPendingDraftWithPatch: (patch) => {
      if (!pendingDraft) return;
      onChange({ ...pendingDraft.settings, ...patch });
      setPendingDraft(null);
      setOpenThrough(0);
      setCompactStage("structure");
    },
    commitStructureSwitch: (option) => {
      onChange(draftForStructure(option, settings));
      setPendingDraft(null);
      setOpenThrough(0);
      setCompactStage("structure");
    },
  };

  const structureContent = <WorkspaceMapLayoutStructureContent settings={settings} previewFamily={previewFamily} mode={mode} onCreateNewMap={onCreateNewMap} actions={actions} structures={structures} />;
  const directionContent = <WorkspaceMapLayoutDirectionContent settings={effectiveSettings} previewFamily={previewFamily} previewDirection={previewDirection ?? "right"} resolvedTimelineBranchMode={resolvedTimelineBranchMode} onChange={onChange} actions={actions} />;
  const lineContent = <WorkspaceMapLayoutLineContent settings={effectiveSettings} previewFamily={previewFamily} actions={actions} onChange={onChange} />;
  const paletteContent = <WorkspaceMapLayoutPaletteContent settings={effectiveSettings} actions={actions} onChange={onChange} />;

  const compactPath: readonly WorkspaceMapLayoutStage[] = compactStage === "structure"
    ? ["structure"]
    : compactStage === "direction"
      ? ["structure", "direction"]
      : compactStage === "line"
        ? (hasDirection ? (hasLineStyle ? ["structure", "direction", "line"] : ["structure", "direction"]) : (hasLineStyle ? ["structure", "line"] : ["structure"]))
        : (hasDirection
          ? (hasLineStyle ? ["structure", "direction", "line", "palette"] : ["structure", "direction", "palette"])
          : (hasLineStyle ? ["structure", "line", "palette"] : ["structure", "palette"]));
  const compactContent = compactStage === "structure" ? structureContent
    : compactStage === "direction" ? directionContent
      : compactStage === "line" ? lineContent : paletteContent;
  const handleCompactBack = () => {
    if (compactStage === "palette") setCompactStage(hasLineStyle ? "line" : hasDirection ? "direction" : "structure");
    else if (compactStage === "line") setCompactStage(hasDirection ? "direction" : "structure");
    else setCompactStage("structure");
  };
  return (
    <div ref={rootRef} className="relative" style={{ width: STRUCTURE_WIDTH }} onMouseLeave={() => setPreviewFamily(activeFamily)}>
      {presentation?.mode === "compact" ? <WorkspaceMapLayoutCompact stage={compactStage} path={compactPath} onBack={handleCompactBack} onNavigate={setCompactStage}>{compactContent}</WorkspaceMapLayoutCompact> : <WorkspaceMapLayoutColumn title="Structure">{structureContent}</WorkspaceMapLayoutColumn>}
      {presentation?.mode === "cascade" && openThrough >= 1 && hasDirection && <WorkspaceMapLayoutFlyoutColumn side={presentation.side} offset={STRUCTURE_WIDTH} width={DIRECTION_WIDTH} title="Direction">{directionContent}</WorkspaceMapLayoutFlyoutColumn>}
      {presentation?.mode === "cascade" && hasLineStyle && openThrough >= lineStage && <WorkspaceMapLayoutFlyoutColumn side={presentation.side} offset={STRUCTURE_WIDTH + FLYOUT_GAP + (hasDirection ? DIRECTION_WIDTH : 0)} width={LINE_WIDTH} title="Line Style">{lineContent}</WorkspaceMapLayoutFlyoutColumn>}
      {presentation?.mode === "cascade" && openThrough >= paletteStage && <WorkspaceMapLayoutFlyoutColumn side={presentation.side} offset={STRUCTURE_WIDTH + FLYOUT_GAP + (hasDirection ? DIRECTION_WIDTH : 0) + (hasLineStyle ? FLYOUT_GAP + LINE_WIDTH : 0)} width={PALETTE_WIDTH} title="Color Palette">{paletteContent}</WorkspaceMapLayoutFlyoutColumn>}
    </div>
  );
}
