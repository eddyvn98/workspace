import { ALL_MODELS, MODEL_ASPECT_RATIOS, MODEL_RESOLUTIONS, getModelMaxInputImages, type ImageModelId } from "@/types/image-generation.types";
import { getImageFlowModeLimitation, getModeOptionFields } from "./image-flow-option-fields";

export const IMAGE_FLOW_MODES = ["Generate Image", "View Creator", "Image Editor", "Other Tools"] as const;
export const IMAGE_FLOW_SUBMODES: Record<string, string[]> = {
	"Generate Image": ["ARCHITECTURE", "INTERIOR", "URBAN PLANNING", "LANDSCAPE", "3D FLOOR PLAN", "FLOOR PLAN TO 3D VIEW ROOM"],
	"View Creator": ["Create 1 new camera angle", "Create multiple view with multiple prompt"],
	"Image Editor": ["Add/Remove/Replace the object (furniture, item, people, tree, ...) by Selection Area and input the description or PNG", "Insert Building to Site (Add a new building to the area highlighted existing image)", "Material", "Lighting", "Watermark, Logo"],
	"Other Tools": ["Coloring", "VR360", "Texture Material", "Drawing Technical", "Analysis Architecture", "3D Section Perspective", "Expand View", "Resolution", "Render Enhance"],
};

export function imageFlowCapabilities(mainMode?: string, subMode?: string) {
	const fields = mainMode && subMode ? getModeOptionFields(mainMode, subMode) : [];
	const models: ImageModelId[] = ["Auto", ...ALL_MODELS];
	return {
		modes: IMAGE_FLOW_MODES,
		subModes: mainMode && IMAGE_FLOW_SUBMODES[mainMode] ? IMAGE_FLOW_SUBMODES[mainMode] : IMAGE_FLOW_SUBMODES,
		optionGroups: fields.map((field) => ({ key: field.key, label: field.label, multiple: Boolean(field.multiple), values: field.choices?.map((choice) => ({ value: choice.value, label: choice.label, group: choice.group })) ?? field.choice ?? [], editable: Boolean(field.editable || !field.choices?.length && !field.choice?.length) })),
		limitation: mainMode && subMode ? getImageFlowModeLimitation(mainMode, subMode) ?? null : null,
		settings: {
			models: models.map((model) => ({ id: model, maxInputImages: getModelMaxInputImages(model), aspectRatios: MODEL_ASPECT_RATIOS[model], resolutions: MODEL_RESOLUTIONS[model] })),
			imageCount: { minimum: 1, maximum: 4 },
		},
	};
}
