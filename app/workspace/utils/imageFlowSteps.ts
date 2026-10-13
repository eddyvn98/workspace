import { createBlockId, createDualTransform, resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import type { ImageFlowAdvancedLevel, ImageFlowBlockData } from "../types/imageFlow";
import { isImageFlowBlock } from "../types/imageFlow";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { getModeOptionFields } from "../renderers/imageFlowOptionFields";

export function addNextImageFlowStep(parentId: string, advancedLevel: ImageFlowAdvancedLevel): string {
	const state = useWorkspaceStore.getState();
	const parent = state.blocks[parentId];
	if (!isImageFlowBlock(parent) || (parent.data.stepKind !== "advanced" && !(parent.data.stepKind === "reference" && advancedLevel === "mode"))) throw new Error("The previous flow step is missing.");
	const existingChild = Object.values(state.connectors).find((edge) => {
		const child = state.blocks[edge.toBlockId];
		return edge.kind === "image-flow" && edge.fromBlockId === parentId && isImageFlowBlock(child) && child.data.stepKind === "advanced";
	});
	if (existingChild) {
		const child = state.blocks[existingChild.toBlockId];
		if (isImageFlowBlock(child) && child.data.stepKind === "advanced") return child.id;
	}
	const tail = Object.values(state.connectors).find((edge) => {
		const target = state.blocks[edge.toBlockId];
		return edge.kind === "image-flow" && edge.fromBlockId === parentId && isImageFlowBlock(target) && target.data.stepKind === "generate";
	});
	if (!tail) throw new Error("Connect the Advanced sequence to a Generate block first.");
	const generator = state.blocks[tail.toBlockId];
	if (!isImageFlowBlock(generator) || generator.data.stepKind !== "generate") throw new Error("The Generate block is missing.");
	const rect = resolveTransform(generator.transform, { x: 0, y: 0, w: 400, h: 380, rotation: 0, zIndex: 0 });
	const data: ImageFlowBlockData = {
		flowId: parent.data.flowId, stepKind: "advanced", parentBlockId: parent.id, advancedLevel,
		...(advancedLevel === "group" ? { layoutVersion: 3 } : {}),
		...(advancedLevel === "submode" ? { settings: { sub_mode: "" } } : {}),
	};
	const child: CanvasBlock<"imageFlow"> = {
		id: createBlockId(), type: "imageFlow",
		transform: createDualTransform({ x: rect.x, y: rect.y, w: advancedLevel === "group" ? 360 : 320, h: advancedLevel === "group" ? 260 : 180, rotation: 0, zIndex: rect.zIndex }),
		data, createdAt: Date.now(), updatedAt: Date.now(),
	};
	state.removeConnector(tail.id);
	state.updateBlockTransform(generator.id, { x: rect.x + 420 }, "override");
	state.addBlock(child);
	const previousConnected = state.addConnector({ id: createConnectorId(), kind: "image-flow", fromBlockId: parent.id, toBlockId: child.id, lineType: "curved", arrowEnd: true });
	const generatorConnected = previousConnected && state.addConnector({ id: createConnectorId(), kind: "image-flow", fromBlockId: child.id, toBlockId: generator.id, lineType: "curved", arrowEnd: true });
	if (!previousConnected || !generatorConnected) {
		const fresh = useWorkspaceStore.getState();
		Object.values(fresh.connectors).filter((edge) => edge.fromBlockId === child.id || edge.toBlockId === child.id).forEach((edge) => fresh.removeConnector(edge.id));
		fresh.removeBlock(child.id);
		fresh.updateBlockTransform(generator.id, { x: rect.x }, "override");
		fresh.addConnector(tail);
		throw new Error("Could not add the next Advanced step to this flow.");
	}
	useWorkspaceStore.getState().setSelection([child.id]);
	return child.id;
}

export function addNextAdvancedGroup(tailId: string): string {
	return addNextImageFlowStep(tailId, "group");
}

export function insertImageFlowOptionGroup(flowId: string, optionGroup: string, parentBlockIds?: string[]): string {
	const state = useWorkspaceStore.getState();
	const flowBlocks = Object.values(state.blocks).filter((block) => isImageFlowBlock(block) && block.data.flowId === flowId) as CanvasBlock<"imageFlow">[];
	const generator = flowBlocks.find((block) => block.data.stepKind === "generate");
	if (!generator) throw new Error("Choose a flow with a Generate block first.");
	const ancestors = new Map<string, CanvasBlock<"imageFlow">>();
	const queue = [generator.id];
	const visited = new Set(queue);
	while (queue.length) {
		const currentId = queue.shift()!;
		for (const edge of Object.values(state.connectors).filter((item) => item.kind === "image-flow" && item.toBlockId === currentId)) {
			const previous = state.blocks[edge.fromBlockId];
			if (!isImageFlowBlock(previous) || previous.data.stepKind === "reference" || visited.has(previous.id)) continue;
			visited.add(previous.id);
			ancestors.set(previous.id, previous as CanvasBlock<"imageFlow">);
			queue.push(previous.id);
		}
	}
	const upstream = [...ancestors.values()];
	const mode = (upstream.find((block) => block.data.advancedLevel === "mode") ?? flowBlocks.find((block) => block.data.advancedLevel === "mode"))?.data.settings?.main_mode;
	const subMode = (upstream.find((block) => block.data.advancedLevel === "submode") ?? flowBlocks.find((block) => block.data.advancedLevel === "submode"))?.data.settings?.sub_mode;
	if (!mode || !subMode) throw new Error("Set Mode and Submode before adding an option group.");
	const fields = getModeOptionFields(mode, subMode);
	const targetIndex = fields.findIndex((field) => field.key === optionGroup);
	if (targetIndex < 0) throw new Error("This option is not available for the selected Submode.");
	const groupBlocks = upstream.filter((block) => block.data.advancedLevel === "group" && block.data.optionGroup);
	if (!parentBlockIds && groupBlocks.some((block) => block.data.optionGroup === optionGroup)) throw new Error("This option is already in the flow.");
	const nextGroup = groupBlocks
		.filter((block) => fields.findIndex((field) => field.key === block.data.optionGroup) > targetIndex)
		.sort((a, b) => fields.findIndex((field) => field.key === a.data.optionGroup) - fields.findIndex((field) => field.key === b.data.optionGroup))[0];
	const selectedTargets = parentBlockIds ? [...new Set(Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && parentBlockIds.includes(edge.fromBlockId)).map((edge) => edge.toBlockId))] : [];
	if (parentBlockIds && selectedTargets.length !== 1) throw new Error("Select the connected parent step before restoring this option.");
	const selectedTarget = parentBlockIds ? state.blocks[selectedTargets[0]] : undefined;
	if (parentBlockIds && !isImageFlowBlock(selectedTarget)) throw new Error("The next Image Flow step is missing.");
	const next = parentBlockIds ? selectedTarget as CanvasBlock<"imageFlow"> : nextGroup ?? generator;
	const parentEdges = Object.values(state.connectors).filter((edge) => {
		if (edge.kind !== "image-flow" || edge.toBlockId !== next.id) return false;
		if (parentBlockIds) return parentBlockIds.includes(edge.fromBlockId);
		const parent = state.blocks[edge.fromBlockId];
		if (!isImageFlowBlock(parent) || !["mode", "submode", "group"].includes(parent.data.advancedLevel ?? "")) return false;
		if (parent.data.advancedLevel !== "group") return true;
		return fields.findIndex((field) => field.key === parent.data.optionGroup) < targetIndex;
	});
	const parents = [...new Map(parentEdges.map((edge) => [edge.fromBlockId, state.blocks[edge.fromBlockId] as CanvasBlock<"imageFlow">])).values()];
	if (!parents.length || (parentBlockIds && parents.length !== parentBlockIds.length)) throw new Error("Could not locate the insertion point for every selected parent.");
	if (parentBlockIds && parents.some((parent) => !parent.data.skippedOptionGroups?.includes(optionGroup))) throw new Error("This option was not skipped from the selected step.");
	const previous = parents[0];
	const previousRect = resolveTransform(previous.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
	const zIndex = Math.max(0, ...Object.values(state.blocks).map((block) => resolveTransform(block.transform, { x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0 }).zIndex)) + 1;
	const childId = createBlockId();
	const child: CanvasBlock<"imageFlow"> = {
		id: childId, type: "imageFlow",
		transform: createDualTransform({ x: previousRect.x + 420, y: previousRect.y, w: 360, h: 260, rotation: 0, zIndex }),
		data: { flowId, stepKind: "advanced", parentBlockId: previous.id, advancedLevel: "group", optionGroup, layoutVersion: 3 },
		createdAt: Date.now(), updatedAt: Date.now(),
	};
	const downstream = new Map<string, CanvasBlock<"imageFlow">>();
	const downstreamQueue = [next.id];
	const downstreamVisited = new Set<string>();
	while (downstreamQueue.length) {
		const currentId = downstreamQueue.shift()!;
		if (downstreamVisited.has(currentId)) continue;
		downstreamVisited.add(currentId);
		const current = state.blocks[currentId];
		if (!isImageFlowBlock(current)) continue;
		downstream.set(current.id, current as CanvasBlock<"imageFlow">);
		if (current.data.stepKind === "generate") continue;
		Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === currentId).forEach((edge) => downstreamQueue.push(edge.toBlockId));
	}
	parentEdges.forEach((edge) => state.removeConnector(edge.id));
	state.addBlock(child);
	for (const block of downstream.values()) {
		const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
		state.updateBlockTransform(block.id, { x: rect.x + 420 }, "override");
	}
	const firstEdges = parents.map((parent) => ({ id: createConnectorId(), kind: "image-flow" as const, fromBlockId: parent.id, toBlockId: child.id, lineType: "curved" as const, arrowEnd: true }));
	const addedFirst = firstEdges.filter((edge) => state.addConnector(edge));
	const second = addedFirst.length === firstEdges.length && state.addConnector({ id: createConnectorId(), kind: "image-flow", fromBlockId: child.id, toBlockId: next.id, lineType: "curved", arrowEnd: true });
	if (addedFirst.length !== firstEdges.length || !second) {
		const fresh = useWorkspaceStore.getState();
		Object.values(fresh.connectors).filter((edge) => edge.fromBlockId === child.id || edge.toBlockId === child.id).forEach((edge) => fresh.removeConnector(edge.id));
		fresh.removeBlock(child.id);
		for (const block of downstream.values()) {
			const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
			fresh.updateBlockTransform(block.id, { x: rect.x - 420 }, "override");
		}
		parentEdges.forEach((edge) => fresh.addConnector(edge));
		throw new Error("Could not add this option to the flow.");
	}
	useWorkspaceStore.getState().setSelection([child.id]);
	for (const parent of parents) {
		const freshParent = useWorkspaceStore.getState().blocks[parent.id];
		if (isImageFlowBlock(freshParent)) state.updateBlock(parent.id, { data: { ...freshParent.data, skippedOptionGroups: (freshParent.data.skippedOptionGroups ?? []).filter((key) => key !== optionGroup) } });
	}
	return child.id;
}

export function removeImageFlowOptionGroup(blockId: string): boolean {
	const state = useWorkspaceStore.getState();
	const block = state.blocks[blockId];
	if (!isImageFlowBlock(block) || block.data.stepKind !== "advanced" || block.data.advancedLevel !== "group") return false;
	const incoming = Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.toBlockId === blockId);
	const outgoing = Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === blockId);
	if (!incoming.length || !outgoing.length || (incoming.length > 1 && outgoing.length > 1)) throw new Error("This shared option cannot be skipped while it has multiple input and output branches.");
	const parentIds = incoming.map((edge) => edge.fromBlockId);
	const childIds = outgoing.map((edge) => edge.toBlockId);
	const edgesToRemove = [...incoming, ...outgoing];
	edgesToRemove.forEach((edge) => state.removeConnector(edge.id));
	const bypasses = parentIds.flatMap((fromBlockId) => childIds.map((toBlockId) => ({
		id: createConnectorId(), kind: "image-flow" as const, fromBlockId, toBlockId, lineType: "curved" as const, arrowEnd: true,
	})));
	const added: string[] = [];
	for (const connector of bypasses) {
		if (!state.addConnector(connector)) break;
		added.push(connector.id);
	}
	if (added.length !== bypasses.length) {
		const fresh = useWorkspaceStore.getState();
		added.forEach((id) => fresh.removeConnector(id));
		edgesToRemove.forEach((edge) => fresh.addConnector(edge));
		throw new Error("Could not reconnect the flow around this option.");
	}
	const fresh = useWorkspaceStore.getState();
	for (const childId of childIds) {
		const child = fresh.blocks[childId];
		if (isImageFlowBlock(child) && child.data.parentBlockId === blockId) fresh.updateBlock(childId, { data: { ...child.data, parentBlockId: parentIds[0] } });
	}
	if (block.data.optionGroup) for (const parentId of parentIds) {
		const parent = useWorkspaceStore.getState().blocks[parentId];
		if (isImageFlowBlock(parent)) state.updateBlock(parentId, { data: { ...parent.data, skippedOptionGroups: [...new Set([...(parent.data.skippedOptionGroups ?? []), block.data.optionGroup])] } });
	}
	state.removeBlock(blockId);
	if (outgoing.length === 1) {
		let cursor = outgoing[0].toBlockId;
		const visited = new Set<string>();
		while (!visited.has(cursor)) {
			visited.add(cursor);
			const child = useWorkspaceStore.getState().blocks[cursor];
			if (!isImageFlowBlock(child)) break;
			const rect = resolveTransform(child.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
			state.updateBlockTransform(child.id, { x: rect.x - 420 }, "override");
			if (child.data.stepKind === "generate") break;
			const next = Object.values(useWorkspaceStore.getState().connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === child.id);
			if (next.length !== 1) break;
			cursor = next[0].toBlockId;
		}
	}
	state.setSelection(parentIds);
	return true;
}

export function resetAdvancedDescendants(parentId: string): void {
	const state = useWorkspaceStore.getState();
	const parent = state.blocks[parentId];
	if (!isImageFlowBlock(parent) || parent.data.stepKind !== "advanced") return;
	let edge = Object.values(state.connectors).find((item) => item.kind === "image-flow" && item.fromBlockId === parentId);
	const generatorId: string | undefined = (() => {
		let currentEdge = edge;
		const visited = new Set<string>([parentId]);
		while (currentEdge) {
			const next = state.blocks[currentEdge.toBlockId];
			if (!isImageFlowBlock(next) || visited.has(next.id)) return undefined;
			if (next.data.stepKind === "generate") return next.id;
			visited.add(next.id);
			currentEdge = Object.values(state.connectors).find((item) => item.kind === "image-flow" && item.fromBlockId === next.id);
		}
		return undefined;
	})();
	if (!generatorId) return;
	const parentRect = resolveTransform(parent.transform, { x: 0, y: 0, w: 320, h: 180, rotation: 0, zIndex: 0 });
	const removed = new Set<string>();
	while (edge && edge.toBlockId !== generatorId) {
		const child = state.blocks[edge.toBlockId];
		const nextEdge = child ? Object.values(state.connectors).find((item) => item.kind === "image-flow" && item.fromBlockId === child.id) : undefined;
		state.removeConnector(edge.id);
		if (child && isImageFlowBlock(child) && child.data.stepKind === "advanced" && !removed.has(child.id)) {
			removed.add(child.id);
			state.removeBlock(child.id);
		}
		edge = nextEdge;
	}
	if (edge?.toBlockId === generatorId) state.removeConnector(edge.id);
	state.updateBlockTransform(generatorId, { x: parentRect.x + 420 }, "override");
	if (!state.addConnector({ id: createConnectorId(), kind: "image-flow", fromBlockId: parentId, toBlockId: generatorId, lineType: "curved", arrowEnd: true })) {
		throw new Error("Could not reset the Advanced sequence.");
	}
}
