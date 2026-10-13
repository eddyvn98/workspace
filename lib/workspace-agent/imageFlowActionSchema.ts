import type { RuntimeActionSchema } from "./actionSchema";

const STRING = { type: "string" } as const;
const STRING_ARRAY = { type: "array", items: STRING } as const;

export const IMAGE_FLOW_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
	create_image_flow: {
		type: "object",
		additionalProperties: false,
		required: ["type", "prompt"],
		properties: {
			type: { type: "string", const: "create_image_flow" },
			prompt: { type: "string", minLength: 1, maxLength: 8000 },
			mainMode: STRING,
			mode: STRING,
			subMode: STRING,
			options: { type: "object", additionalProperties: true },
			settings: {
				type: "object", additionalProperties: false,
				properties: {
					model: STRING, aspect_ratio: STRING, resolution: STRING,
					image_count: { type: "integer", minimum: 1, maximum: 4 },
					seed: STRING, custom_seed: { type: "integer", minimum: 0 },
					enhance_prompt: STRING,
				},
			},
			model: STRING,
			aspectRatio: STRING,
			resolution: STRING,
			imageCount: { type: "integer", minimum: 1, maximum: 4 },
			generate: { type: "boolean", const: false },
			mainImageBlockIds: STRING_ARRAY,
			referenceImageBlockIds: STRING_ARRAY,
			x: { type: "number", minimum: -1000000, maximum: 1000000 },
			y: { type: "number", minimum: -1000000, maximum: 1000000 },
		},
	},
};
