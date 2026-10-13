import { describe, expect, it } from "vitest";
import { suppressWorkspaceActionReplays, workspaceActionReplayKey } from "@/lib/workspace-agent/actionReplayGuard";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

const createFlow = {
	type: "create_image_flow",
	prompt: "modern courtyard house",
	mainMode: "Generate Image",
	subMode: "ARCHITECTURE",
	options: { style: "Modern", exterior_building_subtype: "Single Family" },
	settings: { model: "Auto", aspect_ratio: "1:1", resolution: "1K", image_count: 1 },
};

describe("workspace agent action replay guard", () => {
	it("accepts the CLI payload shape returned by Dify", () => {
		expect(validateWorkspaceRuntimeAction(createFlow)).toBeNull();
	});

	it("suppresses a repeated Image Flow creation after its receipt is confirmed", () => {
		const key = workspaceActionReplayKey(createFlow);
		expect(key).not.toBeNull();
		expect(suppressWorkspaceActionReplays([createFlow], new Set([key!]))).toEqual({ actions: [], suppressed: 1 });
	});

	it("treats legacy top-level settings as the same Image Flow intent", () => {
		const legacy = {
			type: "create_image_flow",
			prompt: "Modern courtyard house",
			mode: "Generate Image",
			subMode: "architecture",
			options: { exterior_building_subtype: "Single Family", style: "Modern" },
			model: "Auto", aspectRatio: "1:1", resolution: "1K", imageCount: 1,
		};
		expect(workspaceActionReplayKey(legacy)).toBe(workspaceActionReplayKey(createFlow));
	});
});
