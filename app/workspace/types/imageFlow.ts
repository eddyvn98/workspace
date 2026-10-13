import type { ImagePayloadInputs } from "@/types/image-generation.types";
import type { CanvasBlock } from "./block";

export type ImageFlowStepKind = "prompt" | "reference" | "advanced" | "generate";
export type ImageFlowOptionGroup = string;
export type ImageFlowAdvancedLevel = "mode" | "submode" | "group";
export type ImageFlowRunStatus = "idle" | "running" | "complete" | "error";

export interface ImageFlowImageInput {
	url: string;
	downloadUrl?: string;
	name?: string;
	resourceId?: string;
	blockId?: string;
}

export interface ImageFlowBlockData {
	flowId: string;
	stepKind: ImageFlowStepKind;
	customPrompt?: boolean;
	parentBlockId?: string;
	advancedLevel?: ImageFlowAdvancedLevel;
	optionGroup?: ImageFlowOptionGroup;
	/** Optional child groups removed from this step with Skip. */
	skippedOptionGroups?: string[];
	prompt?: string;
	manualText?: string;
	referenceBlockId?: string;
	mainImage?: ImageFlowImageInput;
	referenceImage?: ImageFlowImageInput;
	mainImages?: ImageFlowImageInput[];
	referenceImages?: ImageFlowImageInput[];
	settings?: Partial<ImagePayloadInputs>;
	skipped?: boolean;
	layoutVersion?: number;
	runStatus?: ImageFlowRunStatus;
	runMessage?: string;
}

export function isImageFlowBlock(value: unknown): value is CanvasBlock & { type: "imageFlow"; data: ImageFlowBlockData } {
	if (!value || typeof value !== "object") return false;
	const block = value as { type?: unknown; data?: Record<string, unknown> };
	return block.type === "imageFlow"
		&& typeof block.data?.flowId === "string"
		&& (block.data.stepKind === "prompt" || block.data.stepKind === "reference" || block.data.stepKind === "advanced" || block.data.stepKind === "generate");
}
