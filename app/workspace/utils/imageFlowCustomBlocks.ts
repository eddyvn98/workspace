import { createBlockId, createDualTransform, resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { isImageFlowBlock } from "../types/imageFlow";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export function addCustomImageFlowBlock(parentBlockIds: string[], restoreSkipped = false): string {
	const state = useWorkspaceStore.getState();
	const parents = parentBlockIds.map((id) => state.blocks[id]).filter((block): block is CanvasBlock<"imageFlow"> => isImageFlowBlock(block) && block.data.stepKind === "advanced" && (block.data.advancedLevel === "submode" || block.data.advancedLevel === "group"));
	if (!parents.length || parents.length !== parentBlockIds.length) throw new Error("Select a Submode or option step before adding a custom block.");
	if (parents.length > 1) throw new Error("Select one Advanced step to add a custom block.");
	const parent = parents[0];
	const flowId = parent.data.flowId;
	let outgoing = Object.values(state.connectors).filter((edge) => edge.fromBlockId === parent.id && isImageFlowBlock(state.blocks[edge.toBlockId]));
	let nextIds = [...new Set(outgoing.map((edge) => edge.toBlockId))];
	const anchor = resolveTransform(parent.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
	if (!nextIds.length) {
		const children = Object.values(state.blocks).filter(isImageFlowBlock).map((block) => block as CanvasBlock<"imageFlow">).filter((block) => block.id !== parent.id && (block.data.stepKind === "generate" || (block.data.stepKind === "advanced" && block.data.advancedLevel === "group")) && (block.data.parentBlockId === parent.id || (block.data.flowId === flowId && resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 }).x > anchor.x)));
		children.sort((a, b) => {
			const aRect = resolveTransform(a.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
			const bRect = resolveTransform(b.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
			return (a.data.parentBlockId === parent.id ? -1 : 0) - (b.data.parentBlockId === parent.id ? -1 : 0) || Math.abs(aRect.y - anchor.y) - Math.abs(bRect.y - anchor.y) || (aRect.x - anchor.x) - (bRect.x - anchor.x);
		});
		if (children[0]) {
			nextIds = [children[0].id];
			outgoing = [{ id: createConnectorId(), kind: "image-flow", fromBlockId: parent.id, toBlockId: children[0].id, lineType: "curved", arrowEnd: true }];
		}
	}
	const childId = createBlockId();
	const child: CanvasBlock<"imageFlow"> = { id: childId, type: "imageFlow", transform: createDualTransform({ x: anchor.x + 420, y: anchor.y, w: 360, h: 220, rotation: 0, zIndex: anchor.zIndex + 1 }), data: { flowId, stepKind: "advanced", advancedLevel: "group", optionGroup: "custom_text", parentBlockId: parent.id, layoutVersion: 4 }, createdAt: Date.now(), updatedAt: Date.now() };
	const downstream = collectDownstream(state.blocks, state.connectors, nextIds);
	outgoing.forEach((edge) => state.removeConnector(edge.id));
	state.addBlock(child);
	moveBlocks(state.updateBlockTransform, downstream, 420);
	const first = state.addConnector(makeEdge(parent.id, childId));
	const second = first && nextIds.every((id) => state.addConnector(makeEdge(childId, id)));
	if (!first || !second) {
		const fresh = useWorkspaceStore.getState();
		Object.values(fresh.connectors).filter((edge) => edge.fromBlockId === childId || edge.toBlockId === childId).forEach((edge) => fresh.removeConnector(edge.id));
		fresh.removeBlock(childId);
		moveBlocks(fresh.updateBlockTransform, downstream, -420);
		outgoing.forEach((edge) => fresh.addConnector(edge));
		throw new Error("Could not connect the custom block to this flow.");
	}
	for (const nextId of nextIds) {
		const next = useWorkspaceStore.getState().blocks[nextId];
		if (isImageFlowBlock(next) && next.data.parentBlockId === parent.id) state.updateBlock(nextId, { data: { ...next.data, parentBlockId: childId } });
	}
	if (restoreSkipped) state.updateBlock(parent.id, { data: { ...parent.data, skippedOptionGroups: (parent.data.skippedOptionGroups ?? []).filter((key) => key !== "custom_text") } });
	state.setSelection([childId]);
	return childId;
}

function makeEdge(fromBlockId: string, toBlockId: string): CanvasConnector {
	return { id: createConnectorId(), kind: "image-flow", fromBlockId, toBlockId, lineType: "curved", arrowEnd: true };
}

function collectDownstream(blocks: Record<string, CanvasBlock>, connectors: Record<string, CanvasConnector>, starts: string[]) {
	const result = new Map<string, CanvasBlock>();
	const queue = [...starts];
	while (queue.length) {
		const current = blocks[queue.shift()!];
		if (!isImageFlowBlock(current) || result.has(current.id)) continue;
		result.set(current.id, current);
		if (current.data.stepKind === "generate") {
			Object.values(blocks).filter((item) => item.type === "image").map((item) => item as CanvasBlock<"image">).filter((image) => image.data.imageFlowOrigin?.generateBlockId === current.id).forEach((image) => result.set(image.id, image));
			continue;
		}
		Object.values(connectors).filter((edge) => edge.fromBlockId === current.id && isImageFlowBlock(blocks[edge.toBlockId])).forEach((edge) => queue.push(edge.toBlockId));
	}
	return result;
}

function moveBlocks(update: ReturnType<typeof useWorkspaceStore.getState>["updateBlockTransform"], blocks: Map<string, CanvasBlock>, offset: number) {
	for (const block of blocks.values()) {
		const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 });
		update(block.id, { x: rect.x + offset }, "override");
	}
}
