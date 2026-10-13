import { describe, expect, it } from "vitest";
import { buildImageFlowSummaries } from "@/lib/workspace-agent/imageFlowContext";

describe("Workspace agent Image Flow context", () => {
	it("summarizes ordered steps, settings, and generated image provenance without exposing image URLs", () => {
		const blocks = {
			prompt: { type: "imageFlow", data: { flowId: "flow-1", stepKind: "prompt", prompt: "Modern house" } },
			mode: { type: "imageFlow", data: { flowId: "flow-1", stepKind: "advanced", advancedLevel: "mode", settings: { main_mode: "Generate Image" } } },
			generate: { type: "imageFlow", data: { flowId: "flow-1", stepKind: "generate", settings: { model: "Auto", resolution: "2K" } } },
			image: { type: "image", data: { alt: "Flow 1 · Run 1 · Main 1", url: "https://private.invalid/image.png", imageFlowOrigin: { flowId: "flow-1", generateBlockId: "generate", runId: "run-1", role: "main", outputIndex: 1 } } },
		};

		const result = buildImageFlowSummaries(blocks, ["prompt", "mode", "generate"]);

		expect(result.flowBlocks.prompt).toMatchObject({ flowId: "flow-1", flowName: "Flow 1", stepKind: "prompt", prompt: "Modern house" });
		expect(result.flowBlocks.mode).toMatchObject({ advancedLevel: "mode", settings: { main_mode: "Generate Image" } });
		expect(result.flowBlocks.generate).toMatchObject({ generatedImageCount: 1, generatedImages: [{ id: "image", generateBlockId: "generate", runId: "run-1" }] });
		expect(result.generatedImages.image).toMatchObject({ flowName: "Flow 1", role: "main", outputIndex: 1 });
		expect(JSON.stringify(result)).not.toContain("private.invalid");
	});
});
