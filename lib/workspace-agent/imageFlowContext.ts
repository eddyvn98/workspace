import type { WorkspaceJson } from "./contracts";

function record(value: unknown): WorkspaceJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
}

function summarizeImageInputs(value: unknown): WorkspaceJson[] {
  const inputs = Array.isArray(value) ? value : value ? [value] : [];
  return inputs.slice(0, 10).map((item) => {
    const input = record(item);
    return {
      ...(typeof input.name === "string" ? { name: input.name.slice(0, 120) } : {}),
      ...(typeof input.blockId === "string" ? { blockId: input.blockId } : {}),
      ...(typeof input.resourceId === "string" ? { resourceId: input.resourceId } : {}),
      ...(typeof input.url === "string" ? { hasUrl: true } : {}),
    };
  });
}

function summarizeGeneratedImage(id: string, data: WorkspaceJson, flowNumbers: Map<string, number>): WorkspaceJson | undefined {
  const origin = record(data.imageFlowOrigin);
  if (typeof origin.flowId !== "string" || typeof origin.generateBlockId !== "string") return undefined;
  return {
    id,
    ...(flowNumbers.has(origin.flowId) ? { flowName: `Flow ${flowNumbers.get(origin.flowId)}` } : {}),
    flowId: origin.flowId,
    generateBlockId: origin.generateBlockId,
    ...(typeof origin.runId === "string" ? { runId: origin.runId } : {}),
    ...(typeof origin.role === "string" ? { role: origin.role } : {}),
    ...(typeof origin.outputIndex === "number" ? { outputIndex: origin.outputIndex } : {}),
    ...(typeof data.alt === "string" ? { label: data.alt.slice(0, 160) } : {}),
  };
}

export function buildImageFlowSummaries(
  blocks: WorkspaceJson,
  orderedIds: string[],
): { flowBlocks: Record<string, WorkspaceJson>; generatedImages: Record<string, WorkspaceJson> } {
  const flowNumbers = new Map<string, number>();
  for (const id of orderedIds) {
    const block = record(blocks[id]);
    const data = record(block.data);
    if (block.type !== "imageFlow" || typeof data.flowId !== "string" || flowNumbers.has(data.flowId)) continue;
    flowNumbers.set(data.flowId, flowNumbers.size + 1);
  }

  const generatedImages: Record<string, WorkspaceJson> = {};
  const imagesByGenerator = new Map<string, WorkspaceJson[]>();
  for (const [id, raw] of Object.entries(blocks)) {
    const block = record(raw);
    if (block.type !== "image") continue;
    const summary = summarizeGeneratedImage(id, record(block.data), flowNumbers);
    if (!summary) continue;
    generatedImages[id] = summary;
    const generatorId = String(summary.generateBlockId);
    imagesByGenerator.set(generatorId, [...(imagesByGenerator.get(generatorId) ?? []), summary]);
  }

  const flowBlocks: Record<string, WorkspaceJson> = {};
  for (const [id, raw] of Object.entries(blocks)) {
    const block = record(raw);
    if (block.type !== "imageFlow") continue;
    const data = record(block.data);
    const flowId = typeof data.flowId === "string" ? data.flowId : "";
    const settings = record(data.settings);
    const safeSettings = Object.fromEntries(
      ["main_mode", "sub_mode", "model", "aspect_ratio", "resolution", "image_count"]
        .filter((key) => ["string", "number", "boolean"].includes(typeof settings[key]))
        .map((key) => [key, settings[key]]),
    );
    const generated = imagesByGenerator.get(id) ?? [];
    flowBlocks[id] = {
      flowId,
      ...(flowNumbers.has(flowId) ? { flowName: `Flow ${flowNumbers.get(flowId)}` } : {}),
      ...(typeof data.stepKind === "string" ? { stepKind: data.stepKind } : {}),
      ...(typeof data.advancedLevel === "string" ? { advancedLevel: data.advancedLevel } : {}),
      ...(typeof data.optionGroup === "string" ? { optionGroup: data.optionGroup } : {}),
      ...(typeof data.parentBlockId === "string" ? { parentBlockId: data.parentBlockId } : {}),
      ...(typeof data.prompt === "string" ? { prompt: data.prompt.slice(0, 1000) } : {}),
      ...(Object.keys(safeSettings).length ? { settings: safeSettings } : {}),
      ...(data.skipped === true ? { skipped: true } : {}),
      ...(typeof data.runStatus === "string" ? { runStatus: data.runStatus } : {}),
      ...(typeof data.runMessage === "string" ? { runMessage: data.runMessage.slice(0, 180) } : {}),
      ...(data.stepKind === "reference" ? {
        mainImages: summarizeImageInputs(data.mainImages ?? data.mainImage),
        referenceImages: summarizeImageInputs(data.referenceImages ?? data.referenceImage),
      } : {}),
      ...(data.stepKind === "generate" ? {
        generatedImageCount: generated.length,
        generatedImages: generated.slice(0, 8),
      } : {}),
    };
  }
  return { flowBlocks, generatedImages };
}
