import { getModelMaxInputImages, type AspectRatio, type ImageModelId, type ImagePayloadInputs } from "@/types/image-generation.types";
import { uploadWorkspaceImageWithOriginal } from "./imageUpload";
import { fetchGeneratedImage, makeImageGenerationRequest, readGeneratedImageUrls, uploadReferenceToDify } from "./workspaceImageGeneration";
import { createBlockId, createDualTransform, resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isImageFlowBlock } from "../types/imageFlow";
import { getImageFlowModeLimitation, getModeOptionFields } from "../renderers/imageFlowOptionFields";
import { getImageFlowNumber, getImageFlowRunNumber } from "./imageFlowLabels";

const IMAGE_SIZE: Record<AspectRatio, [number, number]> = {
	"1:1": [420, 420], "1:4": [240, 600], "1:8": [180, 720], "2:3": [340, 510],
	"3:2": [510, 340], "3:4": [340, 453], "4:1": [640, 160], "4:3": [480, 360],
	"4:5": [360, 450], "5:4": [480, 384], "8:1": [720, 180], "9:16": [315, 560],
	"16:9": [560, 315], "21:9": [630, 270],
};

function isCanvasImageBlock(block: CanvasBlock | undefined): block is CanvasBlock<"image"> {
	return block?.type === "image";
}

function patchRunState(blockId: string, status: "running" | "complete" | "error", message: string) {
	const state = useWorkspaceStore.getState();
	const block = state.blocks[blockId];
	if (!isImageFlowBlock(block) || block.data.stepKind !== "generate") return;
	state.updateBlock(blockId, { data: { ...block.data, runStatus: status, runMessage: message } });
}

export async function runImageFlowBlock(blockId: string, onProgress: (message: string) => void) {
	const initial = useWorkspaceStore.getState();
	const generator = initial.blocks[blockId];
	if (!isImageFlowBlock(generator) || generator.data.stepKind !== "generate") throw new Error("The generator block no longer exists.");
	if (initial.isReadOnly) throw new Error("This board is read-only.");
	const boardId = initial.boardId;
	const runId = createBlockId();
	const ordered: CanvasBlock<"imageFlow">[] = [];
	const visited = new Set<string>([generator.id]);
	let cursor = generator.id;
	while (true) {
		let incoming = Object.values(initial.connectors).filter((edge) => edge.kind === "image-flow" && edge.toBlockId === cursor && isImageFlowBlock(initial.blocks[edge.fromBlockId]));
		const current = initial.blocks[cursor];
		if (isImageFlowBlock(current) && current.data.stepKind === "advanced" && current.data.advancedLevel === "mode") {
			incoming = incoming.filter((edge) => {
				const source = initial.blocks[edge.fromBlockId];
				return isImageFlowBlock(source) && source.data.stepKind === "reference" && source.data.flowId === generator.data.flowId;
			});
			if (incoming.length !== 1) throw new Error("Connect this flow’s own Reference step to the shared Mode before running it.");
		}
		if (!incoming.length) break;
		if (incoming.length !== 1) throw new Error("The flow must have exactly one previous step at each point.");
		const previous = initial.blocks[incoming[0].fromBlockId];
		if (!isImageFlowBlock(previous) || visited.has(previous.id)) throw new Error("The flow contains a missing or repeated step.");
		visited.add(previous.id);
		ordered.unshift(previous);
		cursor = previous.id;
	}
	const promptSources = ordered.filter((item) => item?.data.stepKind === "prompt");
	if (promptSources.length !== 1 || ordered[0]?.data.stepKind !== "prompt" || !promptSources[0]?.data.prompt?.trim()) {
		throw new Error("Connect a Prompt block with text to this generator before running it.");
	}
	const referenceSources = ordered.filter((item) => item?.data.stepKind === "reference").filter(isImageFlowBlock);
	const selectedImages = referenceSources.flatMap((reference) => {
		const legacyBlock = reference.data.referenceBlockId ? initial.blocks[reference.data.referenceBlockId] : undefined;
		const legacyImage = isCanvasImageBlock(legacyBlock) ? legacyBlock : undefined;
		const legacyReference = reference.data.referenceImage ?? (legacyImage ? {
			url: legacyImage.data.url, downloadUrl: legacyImage.data.downloadUrl, name: legacyImage.data.alt, resourceId: legacyImage.data.resourceId, blockId: legacyImage.id,
		} : undefined);
		return [
			...(reference.data.mainImages ?? (reference.data.mainImage ? [reference.data.mainImage] : [])).map((image) => ({ role: "main" as const, image })),
			...(reference.data.referenceImages ?? (legacyReference ? [legacyReference] : [])).map((image) => ({ role: "reference" as const, image })),
		];
	});
	const advancedSteps = ordered.filter((item) => item?.data.stepKind === "advanced").filter(isImageFlowBlock);
	const seenGroups = new Set<string>();
	for (const step of advancedSteps) {
		if (step.data.advancedLevel === "mode" && !step.data.settings?.main_mode) throw new Error("Choose a Mode before running this flow.");
		if (step.data.advancedLevel === "submode" && !step.data.settings?.sub_mode) throw new Error("Choose a Submode before running this flow.");
		if (step.data.advancedLevel === "group" && step.data.optionGroup) {
			if (step.data.optionGroup !== "custom_text" && seenGroups.has(step.data.optionGroup)) throw new Error("An advanced option appears more than once in this sequence.");
			seenGroups.add(step.data.optionGroup);
		}
	}
	const settings = advancedSteps.reduce<Partial<ImagePayloadInputs>>((merged, step) => {
		if (step.data.advancedLevel !== "group") return { ...merged, ...(step.data.settings ?? {}) };
		const field = getModeOptionFields(merged.main_mode, merged.sub_mode).find((item) => item.key === step.data.optionGroup);
		const selectedValue = step.data.skipped ? undefined : step.data.settings?.[field?.key as keyof ImagePayloadInputs];
		const manualText = step.data.manualText?.trim();
		if (!manualText) return { ...merged, ...(step.data.skipped ? {} : step.data.settings ?? {}) };
		const previousValue = typeof selectedValue === "string" ? selectedValue : "";
		const combined = [previousValue, manualText].filter(Boolean).join("; ");
		return { ...merged, ...(step.data.skipped ? {} : step.data.settings ?? {}), ...(field ? { [field.key]: combined } : {}) };
	}, { ...(generator.data.settings ?? {}) });
	const limitation = getImageFlowModeLimitation(settings.main_mode, settings.sub_mode);
	if (limitation) throw new Error(limitation);
	const model = (settings.model as ImageModelId | undefined) ?? "Auto";
	if (selectedImages.length > getModelMaxInputImages(model)) {
		throw new Error(`This model accepts up to ${getModelMaxInputImages(model)} input images. Remove an input image or choose another model.`);
	}
	const customPrompts = advancedSteps.filter((step) => step.data.advancedLevel === "group" && step.data.optionGroup === "custom_text").map((step) => step.data.manualText?.trim()).filter((text): text is string => !!text);
	const prompt = [promptSources[0]!.data.prompt!.trim(), ...customPrompts].join("\n\n");
	const inputs: ImagePayloadInputs = {
		model,
		aspect_ratio: settings.aspect_ratio ?? "1:1",
		resolution: settings.resolution ?? "1K",
		seed: settings.seed ?? "Random",
		custom_seed: settings.custom_seed ?? 0,
		enhance_prompt: settings.enhance_prompt ?? "Yes",
		image_count: Math.max(1, Math.min(4, Number(settings.image_count) || 1)),
		...settings,
	};
		patchRunState(blockId, "running", "Preparing inputs…");
	try {
		const uploadIds = await Promise.all(selectedImages.map(async ({ image, role }, index) => {
			const candidate = image.blockId ? useWorkspaceStore.getState().blocks[image.blockId] : undefined;
			const url = isCanvasImageBlock(candidate) ? candidate.data.url : image.url;
			const response = await fetch(url, { credentials: "same-origin" });
			if (!response.ok) throw new Error(`Could not read the ${role} image from Workspace.`);
			const blob = await response.blob();
			if (!blob.type.startsWith("image/")) throw new Error("The reference file is not a valid image.");
			return uploadReferenceToDify(new File([blob], `workspace-${role}-${index + 1}.${blob.type.split("/")[1] || "png"}`, { type: blob.type }));
		}));
		patchRunState(blockId, "running", "Generating images with Image Generator…");
		const response = await fetch("/api/chat/messages", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-category": "IMAGE_KEY" },
			body: JSON.stringify(makeImageGenerationRequest(selectedImages.length ? `${prompt}\n\nInput image roles: ${selectedImages.map((item, index) => `image ${index + 1} is the ${item.role} image`).join("; ")}.` : prompt, inputs, uploadIds)),
		});
		const urls = await readGeneratedImageUrls(response, onProgress);
		if (!urls.length) throw new Error("Dify did not return any images for this flow.");
		if (useWorkspaceStore.getState().boardId !== boardId) throw new Error("The board changed while images were generating. No results were inserted.");
		patchRunState(blockId, "running", `Saving ${urls.length} images to Workspace…`);
		const saved = await Promise.all(urls.map(async (url) => {
			const file = await fetchGeneratedImage(url);
			const result = await uploadWorkspaceImageWithOriginal(file);
			if (!result) throw new Error("Could not save a generated image to Workspace.");
			return result;
		}));
		const state = useWorkspaceStore.getState();
		if (state.boardId !== boardId || state.isReadOnly) throw new Error("The board changed or became read-only. No results were inserted.");
		const anchor = resolveTransform(generator.transform, { x: 0, y: 0, w: 360, h: 260, rotation: 0, zIndex: 0 });
		const zIndex = Math.max(0, ...Object.values(state.blocks).map((block) => resolveTransform(block.transform, { x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0 }).zIndex)) + 1;
		const previousImages = Object.values(state.blocks).filter((block): block is CanvasBlock<"image"> => block.type === "image").filter((block) => block.data.imageFlowOrigin?.generateBlockId === generator.id);
		const flowNumber = getImageFlowNumber(state.blocks, generator.data.flowId) ?? generator.data.flowId.slice(-5);
		const runNumber = getImageFlowRunNumber(state.blocks, generator.data.flowId, runId);
		const previousBottom = previousImages.length ? Math.max(...previousImages.map((block) => { const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0 }); return rect.y + rect.h; })) : anchor.y;
		const [outputWidth, outputHeight] = IMAGE_SIZE[(inputs.aspect_ratio as AspectRatio) in IMAGE_SIZE ? inputs.aspect_ratio as AspectRatio : "1:1"];
		const runStartY = Math.max(anchor.y, previousBottom + (previousImages.length ? 24 : 0));
		const outputStartX = anchor.x + anchor.w + 80;
		const created: CanvasBlock<"image">[] = saved.map((image, index) => {
			const now = Date.now();
			return {
				id: createBlockId(), type: "image",
				transform: createDualTransform({ x: outputStartX + index * (outputWidth + 24), y: runStartY, w: outputWidth, h: outputHeight, rotation: 0, zIndex: zIndex + index }),
				data: {
					url: image.url,
					downloadUrl: image.downloadUrl,
					alt: `Flow ${flowNumber} · Run ${runNumber} · Main ${index + 1}`,
					fit: "contain",
					imageFlowOrigin: { flowId: generator.data.flowId, generateBlockId: generator.id, runId, outputIndex: index + 1, role: "main" },
				},
				createdAt: now, updatedAt: now,
			};
		});
		created.forEach((block) => useWorkspaceStore.getState().addBlock(block));
		created.forEach((image) => {
			const connectorAdded = useWorkspaceStore.getState().addConnector({
				id: createConnectorId(),
				kind: "image-flow",
				fromBlockId: generator.id,
				toBlockId: image.id,
				lineType: "curved",
				strokeColor: "#8b5cf6",
				dashed: true,
				arrowEnd: true,
			});
			if (!connectorAdded) throw new Error("The generated image was saved, but its source-flow connection could not be added.");
		});
		useWorkspaceStore.getState().setSelection(created.map((block) => block.id));
		patchRunState(blockId, "complete", `${created.length} image${created.length === 1 ? "" : "s"} added to the canvas.`);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : "Could not run Image Flow.";
		patchRunState(blockId, "error", message);
		throw cause;
	}
}
