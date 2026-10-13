import type { CanvasBlock } from "../types/block";
import { isImageFlowBlock } from "../types/imageFlow";
import type { WorkspaceImageData } from "../types/image";

export function getImageFlowNumber(blocks: Record<string, CanvasBlock>, flowId: string): number | undefined {
	const flowIds = [...new Set(Object.values(blocks).filter(isImageFlowBlock).map((block) => block.data.flowId))];
	const index = flowIds.indexOf(flowId);
	return index < 0 ? undefined : index + 1;
}

export function getImageFlowRunNumber(blocks: Record<string, CanvasBlock>, flowId: string, runId: string): number {
	const runIds = [...new Set(Object.values(blocks)
		.filter((block): block is CanvasBlock<"image"> => block.type === "image")
		.map((block) => block.data.imageFlowOrigin)
		.filter((origin): origin is NonNullable<typeof origin> => origin?.flowId === flowId)
		.map((origin) => origin.runId))];
	const index = runIds.indexOf(runId);
	return index < 0 ? runIds.length + 1 : index + 1;
}

export function getImageFlowAssetLabel(blocks: Record<string, CanvasBlock>, image: CanvasBlock<"image">): string {
	const origin = image.data.imageFlowOrigin;
	if (!origin) return image.data.alt || "Image";
	const flowNumber = getImageFlowNumber(blocks, origin.flowId);
	const flowLabel = flowNumber ? `Flow ${flowNumber}` : `Flow ${origin.flowId.slice(-5)}`;
	const runNumber = getImageFlowRunNumber(blocks, origin.flowId, origin.runId);
	const role = origin.role === "reference" ? "Reference" : "Main";
	return `${flowLabel} · Run ${runNumber} · ${role} ${origin.outputIndex}`;
}
