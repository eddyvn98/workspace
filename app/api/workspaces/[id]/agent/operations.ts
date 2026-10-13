import { applyCollectionAction } from "./collectionOperations";
import { targetIds } from "./paritySelectionOperations";
import { containerPositions, moveContainerMembers } from "./containerMovement";
import { editContainerFrame } from "./containerFrameEditing";
import type { JsonMap } from "./operationsTables";
import { TABLE_SHEET_COMMANDS, applyTableSheetAction } from "./tableWorkbookOperations";
import { SHEET_STRUCTURE_COMMANDS, applySheetStructureCommand } from "./tableSheetStructureOperations";
import { dispatchTableCommand, isTableDataCommand } from "./tableSurfaceOperations";
import { applySlideAction, type ActionOutcome } from "./slideOperations";
import { applySlidesUpdate } from "./slideBulkUpdate";
import { createSlideDeck } from "./slideDeckCreate";
import { applyFrameAction } from "./frameOperations";
import { applyViewAction } from "./viewOperations";
import { isStructuredMapLayoutType, layoutCreatedMap, layoutExistingMap, mapLayoutFor, resolveLayoutRequest } from "./mapLayout";
import { applyWorkspaceParityAgentAction } from "./parityOperations";
import { applyFileAction } from "./fileOperations";
import { normalizeWorkspaceTextDataStyle, normalizeWorkspaceVisualStyle } from "@/app/workspace/utils/workspaceChatTextStyle";
import type { AgentBoardState } from "./operationsCore";
import { wrapBlocksInFrame } from "./operationsContainerFrame";
import { updateRelationship } from "./operationsRelationship";
import { redirectMapArrange } from "./mapArrangeRedirect";
import { equalizeMapLevelSizes } from "./mapNodeSize";
import { normalizeWholeTextEmphasis } from "./operationsTextFormat";
import { addDrafts, addText, arrayParam, blockRect, connector, diagramArrayParam, duplicateSubtree, duplicateSubtreeAsMap, freePosition, id, mapRoot, now, param, rectanglesOverlap, record, removeConnectors, removeSubtree, resolveId, stringValue } from "./operationsCore";
import { arrangeFlowchartMap, arrangeSemanticFlowchartMap, repairSemanticFlowchart } from "./operationsDiagramLayout";
import { extendFlowchart } from "./operationsDiagramActions";
import { createFlowchart, createSwimlane } from "./operationsDiagramCreate";
import { mapDraftSemanticIds, normalizeMapDrafts } from "./mapDraftTree";
import { shapeAction, freehandAction } from "./operationsShapeActions";
import { applyImageFlowCommand } from "./imageFlowCommands";
export type { AgentBoardState } from "./operationsCore";
export function ensureMapClearOfOtherBlocks(
  state: AgentBoardState,
  rootId: string,
  options: { preserveManualPositions?: boolean } = {},
): void {
  const children = new Map<string, string[]>();
  Object.values(state.blocks).forEach((block) => {
    const parent = String(block.parentId ?? "");
    if (parent) children.set(parent, [...(children.get(parent) ?? []), String(block.id)]);
  });
  const ids: string[] = [];
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length) {
    const blockId = pending.pop()!;
    if (visited.has(blockId) || !state.blocks[blockId]) continue;
    visited.add(blockId);
    ids.push(blockId);
    pending.push(...(children.get(blockId) ?? []));
  }
  const mapIds = new Set(ids);
  const rects = ids.map((blockId) => blockRect(state.blocks[blockId]));
  const bounds = {
    x: Math.min(...rects.map((rect) => rect.x)), y: Math.min(...rects.map((rect) => rect.y)),
    w: Math.max(...rects.map((rect) => rect.x + rect.w)) - Math.min(...rects.map((rect) => rect.x)),
    h: Math.max(...rects.map((rect) => rect.y + rect.h)) - Math.min(...rects.map((rect) => rect.y)),
  };
  const outside = Object.values(state.blocks).filter((block) => !mapIds.has(String(block.id))).map(blockRect);
  if (!rects.some((rect) => outside.some((other) => rectanglesOverlap(rect, other)))) return;
  const free = freePosition(state, { x: bounds.x, y: bounds.y }, bounds.w, bounds.h, ids);
  const dx = free.x - bounds.x;
  const dy = free.y - bounds.y;
  ids.forEach((blockId) => {
    const rect = blockRect(state.blocks[blockId]);
    const current = record(state.blocks[blockId].transform);
    state.blocks[blockId].transform = options.preserveManualPositions
      ? {
        ...current,
        override: { ...rect, x: rect.x + dx, y: rect.y + dy },
      }
      : {
        ...current,
        computed: { ...record(current.computed), ...record(current.override), x: rect.x + dx, y: rect.y + dy },
        override: null,
      };
  });
}

export type AgentActionResult = { ids: string[]; operation: string; geometryChanged?: boolean } & ActionOutcome;

export function applyAgentAction(state: AgentBoardState, raw: JsonMap): AgentActionResult {
  const type = String(raw.type).toLowerCase();
  if (type === "update_style" && "isLocked" in record(param(raw, "style")) && typeof record(param(raw, "style")).isLocked !== "boolean") return { ids: [], reason: "style.isLocked must be a boolean.", operation: type };
  if (type === "update_transform" && targetIds(raw, state).some((id) => record(state.blocks[id]?.style).isLocked === true)) return { ids: [], reason: "A target is position-locked. Unlock with update_style {style:{isLocked:false}} before moving or resizing it.", operation: type };
  const positions = type === "update_transform" ? containerPositions(state) : type === "arrange_selection" ? new Map() : undefined;
  const result = applyAgentActionUnnormalized(state, raw);
  if (positions) result.ids = moveContainerMembers(state, result.ids, positions);
  normalizeWholeTextEmphasis(state, result.ids);
  return result;
}

function applyAgentActionUnnormalized(state: AgentBoardState, raw: JsonMap): AgentActionResult {
  const type = String(raw.type ?? "").toLowerCase();
  const collectionAction = applyCollectionAction(state, raw);
  if (collectionAction) return collectionAction;
  const imageFlowAction = applyImageFlowCommand(state, raw, type);
  if (imageFlowAction) return imageFlowAction;
  const mapLayoutChange = type === "arrange_selection" ? redirectMapArrange(state, raw) : null;
  if (mapLayoutChange) return applyAgentActionUnnormalized(state, mapLayoutChange);
  const fileAction = applyFileAction(state, raw);
  if (fileAction) return fileAction;
  const parityAction = applyWorkspaceParityAgentAction(state, raw);
  if (parityAction) return parityAction;
  if (type === "create") {
    const draft = record(raw.block);
    if (draft.type === "shape") return { ids: shapeAction(state, { ...raw, ...draft, shape: draft }, "create_shape"), operation: type };
    return { ids: [addText(state, Object.keys(draft).length ? draft : raw)], operation: type };
  }
  if (type === "update") {
    const targetId = resolveId({ ...raw, ...(record(raw.blockId).id ? {} : {}) }, state);
    const block = targetId ? state.blocks[targetId] : undefined;
    if (!block) return { ids: [], operation: type };
    const patch = record(raw.patch);
    block.data = { ...record(block.data), ...record(patch.data) };
    Object.assign(block, { ...patch, data: block.data, id: block.id, updatedAt: now() });
    return { ids: [targetId!], operation: type };
  }
  if (type === "delete") return resolveId(raw, state) ? { ids: removeSubtree(state, resolveId(raw, state)!), operation: type } : { ids: [], operation: type };
  if (type === "disconnect") {
    const connectorId = stringValue(param(raw, "connectorId"));
    const matches = Object.entries(state.connectors).filter(([key, item]) => connectorId ? key === connectorId : item.fromBlockId === param(raw, "fromBlockId") && item.toBlockId === param(raw, "toBlockId"));
    matches.forEach(([key]) => delete state.connectors[key]);
    return { ids: matches.map(([key]) => key), operation: type };
  }
  if (type === "connect") {
    const from = stringValue(raw.fromBlockId); const to = stringValue(raw.toBlockId);
    if (!from || !to || !state.blocks[from] || !state.blocks[to] || from === to) return { ids: [], operation: type };
    const linkId = id(); state.connectors[linkId] = { id: linkId, fromBlockId: from, toBlockId: to, lineType: String(raw.lineType ?? "straight"), ...(typeof raw.label === "string" ? { label: raw.label } : {}), ...(typeof raw.arrowEnd === "boolean" ? { arrowEnd: raw.arrowEnd } : {}) };
    return { ids: [from, to], operation: type };
  }
  if (type === "create_flowchart") return { ids: createFlowchart(state, raw), operation: type };
  if (type === "extend_flowchart") return { ids: extendFlowchart(state, raw), operation: type };
  if (type === "repair_connector" || type === "repair_flowchart") return { ids: repairSemanticFlowchart(state, raw), operation: type };
  if (type === "create_swimlane") return { ids: createSwimlane(state, raw), operation: type };
  if (type === "create_map") {
    if (!isStructuredMapLayoutType(param(raw, "layoutType") ?? param(raw, "mapType"))) {
      return { ids: [], operation: type };
    }
    const existingSemanticIds = new Set(Object.values(state.blocks)
      .map((block) => stringValue(record(block.data).semanticKey)?.toLowerCase())
      .filter((value): value is string => Boolean(value)));
    if (mapDraftSemanticIds(raw).some((semanticId) => existingSemanticIds.has(semanticId))) {
      return { ids: [], operation: type, reason: "create_map node ids must be unique across the board." };
    }
    const ids = addDrafts(state, normalizeMapDrafts(raw));
    equalizeMapLevelSizes(state, ids);
    layoutCreatedMap(state, ids, raw);
    return { ids, operation: type };
  }
  if (type === "create_shape" || type.endsWith("_shape")) return { ids: shapeAction(state, raw, type), operation: type };
  if (type === "create_freehand" || type.endsWith("_freehand")) return { ids: freehandAction(state, raw, type), operation: type };
  if (TABLE_SHEET_COMMANDS.includes(type)) {
    const targetId = resolveId(raw, state);
    const block = targetId ? state.blocks[targetId] : undefined;
    return block?.type === "table" && applyTableSheetAction(raw, block, type) ? { ids: [targetId!], operation: type } : { ids: [], operation: type };
  }
  if (isTableDataCommand(type)) return dispatchTableCommand(state, raw, type);
  if (SHEET_STRUCTURE_COMMANDS.includes(type)) return applySheetStructureCommand(state, raw, type);
  if (type === "create_slide_deck") return createSlideDeck(state, raw);
  if (["add_slide", "duplicate_slide", "delete_slide", "reorder_slides", "update_slide", "update_slide_deck", "update_slides"].includes(type)) {
    const targetId = resolveId(raw, state);
    const slideIds = Object.values(state.blocks).filter((block) => block.type === "slideDeck").map((block) => String(block.id));
    const blockId = targetId ?? (slideIds.length === 1 ? slideIds[0] : undefined);
    const block = blockId ? state.blocks[blockId] : undefined;
    const outcome: ActionOutcome = {};
    if (block?.type !== "slideDeck") {
      return { ids: [], operation: type, reason: blockId ? `Block ${blockId} is not a slideDeck.` : "No slideDeck block resolved: pass the deck's blockId (the board has none or several)." };
    }
    if (type === "update_slides") return applySlidesUpdate(raw, block, outcome) ? { ids: [blockId!], operation: type, ...(outcome.notes ? { notes: outcome.notes } : {}) } : { ids: [], operation: type, ...outcome };
    return applySlideAction(raw, block, type, outcome) ? { ids: [blockId!], operation: type, ...(outcome.notes ? { notes: outcome.notes } : {}) } : { ids: [], operation: type, ...outcome };
  }
  if (type === "focus_view") {
    const outcome: ActionOutcome = {};
    const view = applyViewAction(state as unknown as JsonMap, raw, outcome);
    return view.changed ? { ids: view.ids, operation: type } : { ids: [], operation: type, ...outcome };
  }
  if (["create_frame", "update_frame", "delete_frame", "reorder_frames"].includes(type)) {
    const outcome: ActionOutcome = {};
    return applyFrameAction(state as unknown as JsonMap, raw, type, outcome)
      ? { ids: outcome.ids ?? ["frames"], operation: type, ...(outcome.summary ? { summary: outcome.summary } : {}) }
      : { ids: [], operation: type, ...outcome };
  }
  const targetId = resolveId(raw, state);
  if (type === "add_child" || type === "add_sibling") {
    const topic = stringValue(param(raw, "topic")) ?? stringValue(param(raw, "text"));
    const hasDrafts = (Array.isArray(raw.nodes) && raw.nodes.length > 0)
      || Array.isArray(record(raw.params).nodes)
      || raw.node !== undefined
      || raw.to !== undefined;
    const drafts = !hasDrafts && topic ? { ...raw, nodes: [{ topic }] } : raw;
    return { ids: addDrafts(state, drafts, type === "add_child" ? targetId : targetId ? String(state.blocks[targetId]?.parentId ?? "") : undefined), operation: type };
  }
  if (type === "delete_node" || type === "delete_block") return targetId ? { ids: removeSubtree(state, targetId), operation: type } : { ids: [], operation: type };
  if (type === "duplicate_node") return targetId ? { ids: duplicateSubtree(state, targetId, Number(raw.offsetX) || 24, Number(raw.offsetY) || 24), operation: type } : { ids: [], operation: type };
  if (type === "duplicate_map" || type === "copy_branch_to_map") return targetId ? { ids: duplicateSubtreeAsMap(state, targetId), operation: type } : { ids: [], operation: type };
  if (type === "move_node") { if (!targetId) return { ids: [], operation: type }; const block = state.blocks[targetId]; removeConnectors(state, (item) => item.fromBlockId === block.parentId && item.toBlockId === targetId); delete block.parentId; block.isFloating = true; return { ids: [targetId], operation: type }; }
  if (type === "attach_to_parent") { const parentId = resolveId({ target: param(raw, "newParent") }, state); if (!targetId || !parentId || targetId === parentId) return { ids: [], operation: type }; const block = state.blocks[targetId]; removeConnectors(state, (item) => item.toBlockId === targetId && item.fromBlockId === block.parentId); block.parentId = parentId; delete block.isFloating; const link = connector(state, parentId, targetId); state.connectors[String(link.id)] = link; return { ids: [targetId, parentId], operation: type }; }
  if (type === "rename_topic" || type === "update_node" || type === "update_description" || type === "update_style" || type === "update_image" || type === "update_icon") {
    if (!targetId) return { ids: [], operation: type }; const block = state.blocks[targetId]; const data = record(block.data); const node = record(Array.isArray(raw.nodes) ? raw.nodes[0] : undefined); const title = stringValue(param(raw, "title")) ?? stringValue(param(raw, "topic")) ?? stringValue(param(raw, "text")) ?? stringValue(node.topic) ?? stringValue(node.text); if (title) data.markdown = title; const description = param(raw, "description") ?? node.description; if (type === "update_description" || description !== undefined) block.description = String(description ?? ""); const icon = param(raw, "icon") ?? node.icon; if (type === "update_icon" || icon !== undefined) block.icon = String(icon ?? ""); const image = param(raw, "image") ?? param(raw, "url") ?? node.image; const rawImages = param(raw, "images"); const images = arrayParam(raw, "images").map(record).reduce<JsonMap[]>((items, item) => { const url = stringValue(item.url); if (url) items.push({ url, ...(stringValue(item.alt) ? { alt: stringValue(item.alt) } : {}) }); return items; }, []); const removeImageIndex = Number(param(raw, "removeImageIndex")); if (type === "update_image") { if (Array.isArray(rawImages)) block.attachedImages = images.length > 0 ? images : undefined; else if (Number.isInteger(removeImageIndex) && removeImageIndex >= 0) { const current = Array.isArray(block.attachedImages) ? block.attachedImages : []; const remaining = current.filter((_, index) => index !== removeImageIndex); block.attachedImages = remaining.length > 0 ? remaining : undefined; } else if (image !== undefined) { if (block.type === "image") data.url = String(image); else block.attachedImages = [{ url: String(image), alt: String(param(raw, "alt") ?? title ?? "") }]; } } const rawStyle = param(raw, "style"); if (type === "update_style" || record(rawStyle)) { const visualStyle = normalizeWorkspaceVisualStyle(rawStyle); block.style = { ...record(block.style), ...visualStyle }; if (block.type === "shape" && typeof visualStyle?.shapeKind === "string") data.shapeKind = visualStyle.shapeKind; } const textData = normalizeWorkspaceTextDataStyle(rawStyle); if (block.type === "text" && Object.keys(textData).length > 0) Object.assign(data, textData); block.data = data; block.updatedAt = now(); return { ids: [targetId], operation: type };
  }
  if (type === "connect_nodes") { const from = resolveId({ target: param(raw, "from") }, state); const to = resolveId({ target: param(raw, "to") }, state); if (!from || !to || from === to) return { ids: [], operation: type }; const linkId = id(); const connectionStyle = String(param(raw, "connectionStyle") ?? ""); const lineLabel = param(raw, "lineLabel") ?? param(raw, "label"); const link: JsonMap = { id: linkId, fromBlockId: from, toBlockId: to, lineType: "orthogonal", arrowStart: Boolean(param(raw, "arrowStart")), arrowEnd: Boolean(param(raw, "arrowEnd")) || connectionStyle === "straight_arrow", ...(stringValue(lineLabel) ? { label: lineLabel } : {}), ...(stringValue(param(raw, "lineColor")) ? { strokeColor: param(raw, "lineColor") } : {}), ...(param(raw, "lineWidth") !== undefined ? { strokeWidth: Math.max(1, Number(param(raw, "lineWidth"))) } : {}), ...(stringValue(param(raw, "lineDash")) ? { dashed: param(raw, "lineDash") !== "solid" } : {}) }; state.connectors[linkId] = link; return { ids: [linkId], operation: type }; }
  if (type === "wrap_blocks_in_frame") return { ...(editContainerFrame(state, raw) ?? { ids: wrapBlocksInFrame(state, raw) }), operation: type };
  if (type === "update_relationship") return { ids: updateRelationship(state, raw), operation: type };
  if (type === "update_map_style") {
    if (!targetId) return { ids: [], operation: type };
    const rootId = mapRoot(state, targetId);
    const root = state.blocks[rootId];
    const source = record(param(raw, "style"));
    const { requested: requestedLayout, layout } = resolveLayoutRequest(raw);
    if (requestedLayout && !layout) return { ids: [], operation: type };
    const currentLayout = record(root.mapLayout);
    const family = layout
      ? layout === "catalog" ? "treeview" : layout === "org-chart" ? "orgchart" : layout === "timeline" || layout === "vertical-timeline" ? "timeline" : layout === "fishbone" ? "fishbone" : layout === "flowchart" ? "flowchart" : layout === "swimlane" ? "swimlane" : "hierarchy"
      : String(currentLayout.family ?? "hierarchy");
    const direction = stringValue(param(raw, "layoutDirection"))
      ?? stringValue(record(param(raw, "mapLayout")).direction)
      ?? stringValue(record(record(param(raw, "style")).mapLayout).direction)
      ?? (family === "flowchart" ? stringValue(currentLayout.direction) ?? "down" : undefined);
    const requestedConnectionStyle = String(param(raw, "connectionStyle") ?? "").replace("_arrow", "").replace("elbow", "orthogonal");
    const fixedConnectorLineType = family === "hierarchy"
      ? (requestedConnectionStyle === "straight" || requestedConnectionStyle === "orthogonal" || requestedConnectionStyle === "curved" ? requestedConnectionStyle : currentLayout.connectorLineType ?? "curved")
      : family === "orgchart" ? "curved" : "orthogonal";
    const requestedGrowthMode = stringValue(param(raw, "growthMode"));
    const layoutInput: JsonMap = { ...currentLayout, ...raw, layoutType: layout };
    if (raw.growthMode === undefined && record(raw.params).growthMode === undefined && source.growthMode === undefined) {
      delete layoutInput.growthMode;
    }
    // A planner model often re-sends the map's current layoutType as a
    // schema default even when the user only asked for a style tweak (or for
    // nothing structural at all). Only treat this as a real "change the
    // layout" request — and reflow/clear positions accordingly — when the
    // family/direction/growthMode that would actually result differ from
    // what's already stored; otherwise an unrelated update_map_style call
    // would silently discard AI- or user-authored block positions.
    const prospectiveLayout = layout ? mapLayoutFor(layoutInput) : undefined;
    const geometryChanged = prospectiveLayout !== undefined && (
      prospectiveLayout.family !== String(currentLayout.family ?? "hierarchy")
      || prospectiveLayout.direction !== (currentLayout.direction ?? prospectiveLayout.direction)
      || prospectiveLayout.growthMode !== (currentLayout.growthMode ?? prospectiveLayout.growthMode)
    );
    root.mapLayout = {
      ...currentLayout,
      ...source,
      ...(layout ? { family } : {}),
      ...(direction ? { direction } : {}),
      ...(requestedGrowthMode ? { growthMode: requestedGrowthMode } : {}),
      connectorLineType: fixedConnectorLineType,
    };
    if (geometryChanged && family !== "flowchart" && family !== "swimlane") {
      layoutExistingMap(state, rootId, layoutInput);
      ensureMapClearOfOtherBlocks(state, rootId);
    }
    if (family === "flowchart" || currentLayout.family === "flowchart") {
      const targetDirection = direction === "right" ? "right" : "down";
      if (!arrangeSemanticFlowchartMap(state, rootId, targetDirection) && !currentLayout.direction) {
        arrangeFlowchartMap(state, rootId, targetDirection);
      }
    }
    return { ids: [rootId], operation: type, geometryChanged };
  }
  if (type === "reorder_nodes" || type === "replace_children") { if (!targetId) return { ids: [], operation: type }; const rawNodes: unknown[] = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(record(raw.params).nodes) ? record(raw.params).nodes as unknown[] : []; const wanted = rawNodes.map((item: unknown) => typeof item === "string" ? item : String(record(item).id ?? record(item).nodeId ?? "")); const children = state.blockOrder.filter((item: string) => state.blocks[item]?.parentId === targetId); if (wanted.length !== children.length || wanted.some((item: string) => !children.includes(item))) return { ids: [], operation: type }; const indexes = children.map((item: string) => state.blockOrder.indexOf(item)); const ordered = [...state.blockOrder]; indexes.sort((a, b) => a - b).forEach((index, idx) => { ordered[index] = wanted[idx]; }); state.blockOrder = ordered; return { ids: [targetId], operation: type }; }
  return { ids: [], operation: type };
}
