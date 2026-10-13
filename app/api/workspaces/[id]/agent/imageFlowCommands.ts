import { ALL_MODELS, MODEL_ASPECT_RATIOS, MODEL_RESOLUTIONS, getModelMaxInputImages, type ImageModelId } from "@/types/image-generation.types";
import { getModeOptionFields } from "@/lib/workspace/image-flow-option-fields";
import { IMAGE_FLOW_MODES, IMAGE_FLOW_SUBMODES } from "@/lib/workspace/image-flow-capabilities";
import { freePosition, id, now, param, record, stringValue, type AgentBoardState } from "./operationsCore";
import type { JsonMap } from "./routeHelpers";

function flowData(block: JsonMap): JsonMap | undefined {
	if (block.type !== "imageFlow") return undefined;
	const data = record(block.data);
	return typeof data.flowId === "string" && ["prompt", "reference", "advanced", "generate"].includes(String(data.stepKind)) ? data : undefined;
}

function imageFlowBlock(flowId: string, stepKind: string, data: JsonMap, x: number, y: number, w: number, h: number, zIndex: number): JsonMap {
	const created = now();
	return {
		id: id(), type: "imageFlow",
		transform: { computed: null, override: { x, y, w, h, rotation: 0, zIndex } },
		data: { flowId, stepKind, ...data }, createdAt: created, updatedAt: created,
	};
}

function addBlock(state: AgentBoardState, block: JsonMap): void {
	state.blocks[String(block.id)] = block;
	state.blockOrder.push(String(block.id));
}

function connect(state: AgentBoardState, fromBlockId: string, toBlockId: string, imageInput = false): string {
	const connectorId = id();
	state.connectors[connectorId] = {
		id: connectorId, kind: "image-flow", fromBlockId, toBlockId,
		lineType: "curved", ...(imageInput ? { strokeColor: "#8b5cf6", dashed: true } : {}), arrowEnd: true,
	};
	return connectorId;
}

function selectedOptionValue(field: ReturnType<typeof getModeOptionFields>[number], value: unknown): { value: unknown; category?: string } | undefined {
	if (Array.isArray(value)) {
		if (!field.multiple || value.some((item) => typeof item !== "string" || (field.choices?.length && !field.choices.some((choice) => choice.value === item || choice.label === item)))) return undefined;
		return { value };
	}
	if (typeof value !== "string" || !value.trim()) return undefined;
	const choices = field.choices ?? [];
	const match = choices.find((item) => item.value === value || item.label === value);
	if (choices.length > 0 && !match && !field.editable) return undefined;
	if (field.choice && !field.choice.includes(value)) return undefined;
	return { value: match?.value ?? value, ...(match?.group ? { category: match.group } : {}) };
}

function createImageFlow(state: AgentBoardState, raw: JsonMap): string[] {
	const prompt = stringValue(param(raw, "prompt"));
	const mainMode = stringValue(param(raw, "mainMode")) ?? stringValue(param(raw, "mode"));
	const subMode = stringValue(param(raw, "subMode"));
	if (!prompt || (mainMode && !IMAGE_FLOW_MODES.includes(mainMode as typeof IMAGE_FLOW_MODES[number])) || (!!mainMode !== !!subMode)) return [];
	if (mainMode && !IMAGE_FLOW_SUBMODES[mainMode]?.includes(subMode!)) return [];
	const fields = mainMode ? getModeOptionFields(mainMode, subMode) : [];
	const requestedOptions = record(param(raw, "options"));
	if (Object.keys(requestedOptions).some((key) => !fields.some((field) => field.key === key))) return [];
	const settingPatch = { ...record(param(raw, "settings")) };
	const topLevelSettings: Array<[string, string]> = [
		["model", "model"], ["aspectRatio", "aspect_ratio"], ["resolution", "resolution"], ["imageCount", "image_count"],
	];
	for (const [source, target] of topLevelSettings) {
		const value = param(raw, source);
		if (value !== undefined && settingPatch[target] === undefined) settingPatch[target] = value;
	}
	const allowedSettings = new Set(["model", "aspect_ratio", "resolution", "image_count", "seed", "custom_seed", "enhance_prompt"]);
	if (Object.keys(settingPatch).some((key) => !allowedSettings.has(key))) return [];
	const options: Array<{ key: string; value?: unknown; category?: string; manualText?: string }> = [];
	for (const field of fields) {
		if (!(field.key in requestedOptions)) continue;
		const input = requestedOptions[field.key];
		const spec = input && typeof input === "object" && !Array.isArray(input) ? record(input) : { value: input };
		const normalized = selectedOptionValue(field, spec.value);
		const manualText = stringValue(spec.manualText);
		if (!normalized && !manualText) return [];
		options.push({ key: field.key, ...normalized, ...(manualText ? { manualText } : {}) });
	}
	const referenceIds = [...new Set([...(Array.isArray(param(raw, "mainImageBlockIds")) ? param(raw, "mainImageBlockIds") as unknown[] : []), ...(Array.isArray(param(raw, "referenceImageBlockIds")) ? param(raw, "referenceImageBlockIds") as unknown[] : [])])];
	if (referenceIds.some((value) => typeof value !== "string" || state.blocks[value]?.type !== "image" || !stringValue(record(state.blocks[value]?.data).url))) return [];
	const inputModel = stringValue(settingPatch.model) ?? "Auto";
	if (!["Auto", ...ALL_MODELS].includes(inputModel as ImageModelId) || referenceIds.length > getModelMaxInputImages(inputModel as ImageModelId)) return [];
	const widths = [360, 360, 400, ...options.map(() => 320)];
	const totalWidth = widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 80;
	const height = 400;
	const preferred = { x: Number(param(raw, "x")) || 80, y: Number(param(raw, "y")) || 80 };
	const origin = freePosition(state, preferred, totalWidth, height);
	const flowId = id();
	const z = Object.keys(state.blocks).length + 1;
	const blocks: JsonMap[] = [];
	let cursorX = origin.x;
	const promptBlock = imageFlowBlock(flowId, "prompt", { prompt }, cursorX, origin.y, 360, 240, z);
	blocks.push(promptBlock); cursorX += 440;
	const imageBlocks = [param(raw, "mainImageBlockIds"), param(raw, "referenceImageBlockIds")].map((items) => Array.isArray(items) ? items : []);
	const toInputs = (items: unknown[]) => items.map((blockId) => {
		const image = record(state.blocks[String(blockId)]);
		const data = record(image.data);
		return { blockId, url: String(data.url), downloadUrl: data.downloadUrl, name: data.alt, resourceId: data.resourceId };
	});
	const referenceBlock = imageFlowBlock(flowId, "reference", {
		...(imageBlocks[0].length ? { mainImages: toInputs(imageBlocks[0]) } : {}),
		...(imageBlocks[1].length ? { referenceImages: toInputs(imageBlocks[1]) } : {}),
	}, cursorX, origin.y, 360, 240, z + 1);
	blocks.push(referenceBlock); cursorX += 440;
	let previous = referenceBlock;
	if (mainMode) {
		const modeBlock = imageFlowBlock(flowId, "advanced", { parentBlockId: previous.id, advancedLevel: "mode", settings: { main_mode: mainMode }, layoutVersion: 3 }, cursorX, origin.y, 320, 200, z + blocks.length);
		blocks.push(modeBlock); cursorX += 400; previous = modeBlock;
		const submodeBlock = imageFlowBlock(flowId, "advanced", { parentBlockId: previous.id, advancedLevel: "submode", settings: { sub_mode: subMode }, layoutVersion: 3 }, cursorX, origin.y, 320, 200, z + blocks.length);
		blocks.push(submodeBlock); cursorX += 400; previous = submodeBlock;
		for (const option of options) {
			const field = fields.find((item) => item.key === option.key)!;
			const optionSettings = { ...(option.value !== undefined ? { [field.key]: option.value } : {}), ...(field.categoryKey && option.category ? { [field.categoryKey]: option.category } : {}) };
			const child = imageFlowBlock(flowId, "advanced", { parentBlockId: previous.id, advancedLevel: "group", optionGroup: field.key, settings: optionSettings, ...(option.manualText ? { manualText: option.manualText } : {}), layoutVersion: 3 }, cursorX, origin.y, 320, 220, z + blocks.length);
			blocks.push(child); cursorX += 400; previous = child;
		}
	}
	const generateSettings = { model: "Auto", aspect_ratio: "1:1", resolution: "1K", seed: "Random", custom_seed: 0, enhance_prompt: "Yes", image_count: 1, ...settingPatch };
	const selectedModel = String(generateSettings.model ?? "Auto");
	if (!["Auto", ...ALL_MODELS].includes(selectedModel as ImageModelId)) return [];
	const generateModel = selectedModel as ImageModelId;
	if (!MODEL_ASPECT_RATIOS[generateModel]?.includes(String(generateSettings.aspect_ratio) as never)
		|| !MODEL_RESOLUTIONS[generateModel]?.includes(String(generateSettings.resolution) as never)
		|| !Number.isInteger(Number(generateSettings.image_count)) || Number(generateSettings.image_count) < 1
		|| Number(generateSettings.image_count) > 4) return [];
	const generateBlock = imageFlowBlock(flowId, "generate", { settings: generateSettings }, cursorX, origin.y, 400, 380, z + blocks.length);
	blocks.push(generateBlock);
	blocks.forEach((block) => addBlock(state, block));
	const connectorIds = [connect(state, String(promptBlock.id), String(referenceBlock.id))];
	previous = referenceBlock;
	for (const block of blocks.slice(2)) {
		connectorIds.push(connect(state, String(previous.id), String(block.id)));
		previous = block;
	}
	for (const blockId of imageBlocks.flat()) {
		const source = String(blockId);
		connectorIds.push(connect(state, source, String(referenceBlock.id), true));
	}
	return [...blocks.map((block) => String(block.id)), ...connectorIds];
}

function connectImageFlow(state: AgentBoardState, raw: JsonMap): string[] {
	const fromId = stringValue(param(raw, "fromBlockId"));
	const toId = stringValue(param(raw, "toBlockId"));
	const source = fromId ? state.blocks[fromId] : undefined;
	const target = toId ? state.blocks[toId] : undefined;
	const sourceData = source ? flowData(source) : undefined;
	const targetData = target ? flowData(target) : undefined;
	if (!source || !target || !fromId || !toId || fromId === toId) return [];
	const duplicate = Object.values(state.connectors).some((edge) => edge.fromBlockId === fromId && edge.toBlockId === toId && edge.kind === "image-flow");
	if (duplicate) return [];
	const queue = [toId];
	const visited = new Set<string>();
	while (queue.length) {
		const current = queue.shift()!;
		if (current === fromId) return [];
		if (visited.has(current)) continue;
		visited.add(current);
		Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === current).forEach((edge) => queue.push(String(edge.toBlockId)));
	}
	let imageInputPatch: { target: JsonMap; key: string; images: unknown[] } | undefined;
	if (source.type === "image" && targetData?.stepKind === "reference") {
		const origin = record(record(source.data).imageFlowOrigin);
		if (origin.flowId && origin.flowId === targetData.flowId) return [];
		const role = param(raw, "role") === "main" ? "main" : "reference";
		const key = role === "main" ? "mainImages" : "referenceImages";
		const images = Array.isArray(targetData[key]) ? [...targetData[key] as unknown[]] : [];
		if (images.some((item) => record(item).blockId === fromId)) return [];
		const generator = Object.values(state.blocks).find((item) => flowData(item)?.flowId === targetData.flowId && flowData(item)?.stepKind === "generate");
		const model = String(record(record(generator?.data).settings).model ?? "Auto");
		const existingInputs = Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.toBlockId === toId && state.blocks[String(edge.fromBlockId)]?.type === "image").length;
		const configuredInputs = (Array.isArray(targetData.mainImages) ? targetData.mainImages.length : Number(Boolean(targetData.mainImage)))
			+ (Array.isArray(targetData.referenceImages) ? targetData.referenceImages.length : Number(Boolean(targetData.referenceImage || targetData.referenceBlockId)));
		if (Math.max(existingInputs, configuredInputs) + 1 > getModelMaxInputImages(model as never)) return [];
		const imageData = record(source.data);
		images.push({ blockId: fromId, url: imageData.url, downloadUrl: imageData.downloadUrl, name: imageData.alt, resourceId: imageData.resourceId });
		imageInputPatch = { target, key, images };
	} else if (sourceData && targetData) {
		if (targetData.stepKind === "reference") {
			if (sourceData.stepKind !== "prompt" && sourceData.stepKind !== "reference") return [];
			if (sourceData.flowId !== targetData.flowId) return [];
			if (Object.values(state.connectors).some((edge) => edge.kind === "image-flow" && edge.toBlockId === toId && state.blocks[String(edge.fromBlockId)]?.type !== "image")) return [];
		} else if (targetData.stepKind === "advanced") {
			if (sourceData.stepKind !== "reference" && sourceData.stepKind !== "advanced") return [];
			if (targetData.advancedLevel === "mode" && sourceData.stepKind !== "reference") return [];
			if (targetData.advancedLevel !== "mode" && sourceData.stepKind === "advanced" && targetData.parentBlockId !== fromId) return [];
			if (targetData.advancedLevel !== "mode" && Object.values(state.connectors).some((edge) => edge.kind === "image-flow" && edge.toBlockId === toId)) return [];
		} else if (targetData.stepKind === "generate") {
			if (sourceData.stepKind !== "reference" && sourceData.stepKind !== "advanced") return [];
			if (sourceData.stepKind === "reference" && sourceData.flowId !== targetData.flowId) return [];
			if (Object.values(state.connectors).some((edge) => edge.kind === "image-flow" && edge.toBlockId === toId)) return [];
		} else return [];
	} else return [];
	const connectorId = connect(state, fromId, toId, source?.type === "image");
	if (imageInputPatch && targetData) imageInputPatch.target.data = { ...targetData, [imageInputPatch.key]: imageInputPatch.images };
	if (target) target.updatedAt = now();
	return [connectorId, fromId, toId];
}

function imageFlowSettings(state: AgentBoardState, blockId: string): JsonMap {
	const result: JsonMap = {};
	const pending = [blockId];
	const visited = new Set<string>();
	while (pending.length) {
		const current = pending.pop()!;
		if (visited.has(current)) continue;
		visited.add(current);
		const data = flowData(state.blocks[current] ?? {});
		if (data) Object.assign(result, record(data.settings));
		const parentBlockId = data?.parentBlockId;
		if (typeof parentBlockId === "string") pending.push(parentBlockId);
		Object.values(state.connectors).filter((edge) => edge.kind === "image-flow" && edge.toBlockId === current).forEach((edge) => pending.push(String(edge.fromBlockId)));
	}
	return result;
}

export function applyImageFlowCommand(state: AgentBoardState, raw: JsonMap, type: string): { ids: string[]; operation: string } | undefined {
	if (type === "create_image_flow") return { ids: createImageFlow(state, raw), operation: type };
	if (type === "connect_image_flow") return { ids: connectImageFlow(state, raw), operation: type };
	if (type === "update_image_flow_step") {
		const blockId = stringValue(param(raw, "blockId"));
		const block = blockId ? state.blocks[blockId] : undefined;
		const data = block ? flowData(block) : undefined;
		if (!blockId || !block || !data) return { ids: [], operation: type };
		const patch = record(param(raw, "patch"));
		const next = { ...data };
		if (data.stepKind === "prompt" && typeof patch.prompt === "string") next.prompt = patch.prompt;
		else if (data.stepKind === "advanced") {
			const settings = record(data.settings);
			const changes = record(patch.settings);
			const context = imageFlowSettings(state, blockId);
			const groupField = getModeOptionFields(String(context.main_mode ?? ""), String(context.sub_mode ?? "")).find((field) => field.key === String(data.optionGroup ?? ""));
			const allowedKeys = data.advancedLevel === "mode" ? ["main_mode"] : data.advancedLevel === "submode" ? ["sub_mode"] : [groupField?.key, groupField?.categoryKey].filter(Boolean) as string[];
			if (Object.keys(changes).some((key) => !allowedKeys.includes(key))) return { ids: [], operation: type };
			if (data.advancedLevel === "mode" && changes.main_mode !== undefined && !IMAGE_FLOW_MODES.includes(String(changes.main_mode) as typeof IMAGE_FLOW_MODES[number])) return { ids: [], operation: type };
			if (data.advancedLevel === "submode" && changes.sub_mode !== undefined && !IMAGE_FLOW_SUBMODES[String(context.main_mode ?? "")]?.includes(String(changes.sub_mode))) return { ids: [], operation: type };
			if (data.advancedLevel === "group" && groupField && changes[groupField.key] !== undefined && !selectedOptionValue(groupField, changes[groupField.key])) return { ids: [], operation: type };
			next.settings = { ...settings, ...changes };
			if (typeof patch.manualText === "string") next.manualText = patch.manualText;
		} else if (data.stepKind === "generate") {
			const settings = record(data.settings);
			const changes = record(patch.settings);
			const allowedKeys = ["model", "aspect_ratio", "resolution", "image_count", "seed", "custom_seed", "enhance_prompt"];
			if (Object.keys(changes).some((key) => !allowedKeys.includes(key))) return { ids: [], operation: type };
			const nextSettings = { ...settings, ...changes };
			const model = String(nextSettings.model ?? "Auto") as ImageModelId;
			if (!["Auto", ...ALL_MODELS].includes(model) || !MODEL_ASPECT_RATIOS[model]?.includes(String(nextSettings.aspect_ratio) as never)
				|| !MODEL_RESOLUTIONS[model]?.includes(String(nextSettings.resolution) as never)
				|| !Number.isInteger(Number(nextSettings.image_count)) || Number(nextSettings.image_count) < 1 || Number(nextSettings.image_count) > 4
				|| !["Random", "Use last seed", "Custom"].includes(String(nextSettings.seed ?? "Random"))
				|| (nextSettings.seed === "Custom" && (!Number.isInteger(Number(nextSettings.custom_seed)) || Number(nextSettings.custom_seed) < 0))) return { ids: [], operation: type };
			next.settings = nextSettings;
		} else return { ids: [], operation: type };
		block.data = next;
		block.updatedAt = now();
		return { ids: [blockId], operation: type };
	}
	return undefined;
}
