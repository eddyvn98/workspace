import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { isImageFlowBlock } from "../types/imageFlow";
import { getModelMaxInputImages, type ImageModelId } from "@/types/image-generation.types";

function isCanvasImageBlock(block: CanvasBlock | undefined): block is CanvasBlock<"image"> {
	return block?.type === "image";
}

function advancedStepOrder(from: string | undefined, to: string | undefined) {
	if (from === "mode" && to === "submode") return true;
	if (from === "submode" && to === "group") return true;
	return from === "group" && to === "group";
}

export function imageFlowConnectionError(
	blocks: Record<string, CanvasBlock>,
	connectors: Record<string, CanvasConnector>,
	connector: CanvasConnector,
): string | null {
	const source = blocks[connector.fromBlockId];
	const target = blocks[connector.toBlockId];
	const sourceIsFlow = isImageFlowBlock(source);
	const targetIsFlow = isImageFlowBlock(target);
	if (connector.kind === "image-flow" && isCanvasImageBlock(source) && targetIsFlow && target.data.stepKind === "reference") {
		if (source.data.imageFlowOrigin?.flowId === target.data.flowId) return "Use an image from a different flow to avoid a circular input.";
		const incomingImages = Object.values(connectors).filter((edge) => edge.id !== connector.id && edge.kind === "image-flow" && edge.toBlockId === target.id && isCanvasImageBlock(blocks[edge.fromBlockId]));
		if (incomingImages.some((edge) => edge.fromBlockId === source.id)) return "This image is already connected to the Reference step.";
		const queue = [target.id];
		const visited = new Set<string>();
		let model: ImageModelId = "Auto";
		while (queue.length) {
			const id = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);
			const candidate = blocks[id];
			if (isImageFlowBlock(candidate) && candidate.data.stepKind === "generate" && candidate.data.flowId === target.data.flowId) {
				model = (candidate.data.settings?.model as ImageModelId | undefined) ?? "Auto";
				break;
			}
			Object.values(connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === id).forEach((edge) => queue.push(edge.toBlockId));
		}
		const configuredImages = (target.data.mainImages?.length ?? Number(Boolean(target.data.mainImage)))
			+ (target.data.referenceImages?.length ?? Number(Boolean(target.data.referenceImage || target.data.referenceBlockId)));
		const currentCount = Math.max(incomingImages.length, configuredImages);
		if (currentCount >= getModelMaxInputImages(model)) return `This model accepts up to ${getModelMaxInputImages(model)} input images.`;
		return null;
	}
	if (connector.kind === "image-flow" && sourceIsFlow && source.data.stepKind === "generate" && isCanvasImageBlock(target)) {
		const origin = target.data.imageFlowOrigin;
		if (!origin || origin.generateBlockId !== source.id || origin.flowId !== source.data.flowId) {
			return "A generated image must stay connected to its originating flow.";
		}
		if (Object.values(connectors).some((item) => item.id !== connector.id && item.toBlockId === target.id)) return "This image already has a source connection.";
		return null;
	}
	if (!sourceIsFlow && !targetIsFlow && connector.kind !== "image-flow") return null;
	if (connector.kind !== "image-flow" || !sourceIsFlow || !targetIsFlow) return "Image Flow connectors can only join Image Flow blocks.";
	if (source.id === target.id) return "An Image Flow step cannot connect to itself.";
	const pending = Object.values(connectors).filter((item) => item.id !== connector.id && item.kind === "image-flow" && isImageFlowBlock(blocks[item.fromBlockId]) && isImageFlowBlock(blocks[item.toBlockId]));
	const reachable = new Set<string>();
	const queue = [target.id];
	while (queue.length) {
		const current = queue.pop()!;
		if (current === source.id) return "This connection would create a loop.";
		if (reachable.has(current)) continue;
		reachable.add(current);
		pending.filter((item) => item.fromBlockId === current).forEach((item) => queue.push(item.toBlockId));
	}

	if (target.data.stepKind === "reference") {
		if (source.data.stepKind !== "prompt" && source.data.stepKind !== "reference") return "A Reference step must follow Prompt or another Reference step.";
		const incoming = Object.values(connectors).filter((item) => item.id !== connector.id && item.kind === "image-flow" && item.toBlockId === target.id);
		if (incoming.length) return "A Reference step can have only one previous step.";
		return null;
	}
	if (target.data.stepKind === "advanced") {
		if (source.data.stepKind !== "reference" && source.data.stepKind !== "advanced") return "Advanced must follow a Reference or the previous Advanced step.";
		const incoming = Object.values(connectors).filter((item) => item.id !== connector.id && item.kind === "image-flow" && item.toBlockId === target.id);
		if (target.data.advancedLevel === "mode") {
			if (source.data.stepKind !== "reference") return "Mode must be the first Advanced step.";
			const existingReferences = incoming.map((item) => blocks[item.fromBlockId]).filter(isImageFlowBlock);
			if (incoming.length !== existingReferences.length || existingReferences.some((item) => item.data.stepKind !== "reference")) return "Mode can only receive Reference steps.";
			if (existingReferences.some((item) => item.data.flowId === source.data.flowId)) return "This flow already connects to the shared Mode.";
		} else if (incoming.length) {
			return "An Advanced step can have only one previous step.";
		}
		if (source.data.stepKind === "reference" && target.data.advancedLevel !== "mode") return "Mode must be the first Advanced step.";
		if (source.data.stepKind === "advanced" && !advancedStepOrder(source.data.advancedLevel, target.data.advancedLevel)) return "Advanced steps must follow Mode, Submode, then option groups.";
		return null;
	}
	if (target.data.stepKind !== "generate" || (source.data.stepKind !== "reference" && source.data.stepKind !== "advanced")) {
		return "Generate must follow the last Reference or Advanced step.";
	}
	const incoming = Object.values(connectors).filter((item) => item.id !== connector.id && item.kind === "image-flow" && item.toBlockId === target.id);
	if (incoming.some((item) => item.fromBlockId === source.id)) return "These blocks are already connected.";
	if (incoming.length) return "Generate can have only one previous step.";
	if (source.data.stepKind === "advanced" && Object.values(connectors).some((item) => {
		const next = blocks[item.toBlockId];
		return item.kind === "image-flow" && item.fromBlockId === source.id && isImageFlowBlock(next) && next.data.stepKind === "advanced";
	})) {
		return "Connect Generate after the last Advanced step in the shared sequence.";
	}
	return null;
}
