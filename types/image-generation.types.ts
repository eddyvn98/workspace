// ─── Backend Model Strings ─────────────────────────────────────────────────
// These exact strings are used for routing on the backend — do NOT rename.

export type ImageModel =
	| "Alibaba: Qwen Image 2.0 Pro"
	| "Alibaba: Wan 2.7 Image Pro"
	| "Black Forest Labs: Flux.2 Pro"
	| "ByteDance: Seedream 4.5"
	| "Google: Nano Banana Pro"
	| "Google: Nano Banana 2";

/** Internal selection type — "auto" means no explicit model choice. */
export type ImageModelId = "Auto" | ImageModel;

export type AspectRatio =
	| "1:1"
	| "1:4"
	| "1:8"
	| "2:3"
	| "3:2"
	| "3:4"
	| "4:1"
	| "4:3"
	| "4:5"
	| "5:4"
	| "8:1"
	| "9:16"
	| "16:9"
	| "21:9";

export type Resolution = "512" | "1K" | "2K" | "4K";
export type SeedMode = "Random" | "Use last seed" | "Custom";

// ─── Constants ────────────────────────────────────────────────────────────

export const ALL_14_RATIOS: AspectRatio[] = [
	"1:1",
	"1:4",
	"1:8",
	"2:3",
	"3:2",
	"3:4",
	"4:1",
	"4:3",
	"4:5",
	"5:4",
	"8:1",
	"9:16",
	"16:9",
	"21:9",
];

/**
 * All model IDs in display order.
 * Keys are the backend strings — use MODEL_LABELS for UI display names.
 */
export const ALL_MODELS: ImageModel[] = [
	"Alibaba: Qwen Image 2.0 Pro",
	"Alibaba: Wan 2.7 Image Pro",
	"Black Forest Labs: Flux.2 Pro",
	"Google: Nano Banana 2",
	"Google: Nano Banana Pro",
	"ByteDance: Seedream 4.5",
];

export const ALL_RESOLUTIONS: Resolution[] = ["512", "1K", "2K", "4K"];

/** Human-readable labels for the model selector dropdown. */
export const MODEL_LABELS: Record<ImageModelId, string> = {
	"Auto": "Auto",
	"Alibaba: Qwen Image 2.0 Pro": "Qwen Image 2.0 Pro",
	"Alibaba: Wan 2.7 Image Pro": "Wan 2.7 Image Pro",
	"Black Forest Labs: Flux.2 Pro": "Flux.2 Pro",
	"Google: Nano Banana 2": "Nano Banana 2",
	"Google: Nano Banana Pro": "Nano Banana Pro",
	"ByteDance: Seedream 4.5": "Seedream 4.5",
};

/**
 * Maximum number of source images accepted in one image-generation request.
 * This is a combined limit: main images plus reference images.
 * Auto deliberately uses Qwen's stricter limit because it is the fallback model.
 */
export const MODEL_MAX_INPUT_IMAGES: Record<ImageModelId, number> = {
	Auto: 3,
	"Alibaba: Qwen Image 2.0 Pro": 3,
	"Alibaba: Wan 2.7 Image Pro": 9,
	"Black Forest Labs: Flux.2 Pro": 8,
	"Google: Nano Banana 2": 14,
	"Google: Nano Banana Pro": 14,
	"ByteDance: Seedream 4.5": 14,
};

/** Maximum combined image uploads accepted by the configured Dify app. */
export const DIFY_MAX_IMAGE_UPLOADS = 10;

/** Largest combined limit that can reach the configured Dify app. */
export const MAX_IMAGE_INPUTS = Math.min(
	DIFY_MAX_IMAGE_UPLOADS,
	Math.max(...Object.values(MODEL_MAX_INPUT_IMAGES)),
);

export function getModelMaxInputImages(model: ImageModelId): number {
	return Math.min(MODEL_MAX_INPUT_IMAGES[model], DIFY_MAX_IMAGE_UPLOADS);
}

/** Supported aspect ratios per model. */
export const MODEL_ASPECT_RATIOS: Record<ImageModelId, AspectRatio[]> = {
	"Auto": ALL_14_RATIOS,
	"Alibaba: Qwen Image 2.0 Pro": [
		"1:1",
		"2:3",
		"3:2",
		"3:4",
		"4:3",
		"9:16",
		"16:9",
		"21:9",
	],
	"Alibaba: Wan 2.7 Image Pro": ALL_14_RATIOS,
	"Black Forest Labs: Flux.2 Pro": ALL_14_RATIOS,
	"Google: Nano Banana 2": ALL_14_RATIOS,
	"Google: Nano Banana Pro": [
		"1:1",
		"2:3",
		"3:2",
		"3:4",
		"4:3",
		"4:5",
		"5:4",
		"9:16",
		"16:9",
		"21:9",
	],
	"ByteDance: Seedream 4.5": [
		"1:1",
		"2:3",
		"3:2",
		"3:4",
		"4:3",
		"9:16",
		"16:9",
		"21:9",
	],
};

export const MODEL_RESOLUTIONS: Record<ImageModelId, Resolution[]> = {
	"Auto": ["1K", "2K"],
	"Alibaba: Qwen Image 2.0 Pro": ["1K", "2K"],
	"Alibaba: Wan 2.7 Image Pro": ["1K", "2K"],
	"Black Forest Labs: Flux.2 Pro": ["1K", "2K"],
	// Only Nano Banana 2 supports true 4K output
	"Google: Nano Banana 2": ["512", "1K", "2K", "4K"],
	"Google: Nano Banana Pro": ["1K", "2K"],
	"ByteDance: Seedream 4.5": ["2K"],
};

// ─── Backend Payload ──────────────────────────────────────────────────────

/**
 * Shape of the `inputs` object sent to the backend for IMAGE_KEY requests.
 * Field names must match backend expectations exactly.
 *
 * - model:       Exact backend routing string (omit entirely when "auto")
 * - aspect_ratio: Explicit ratio string
 * - resolution:  "512" | "1K" | "2K" | "4K"
 * - seed:        Workflow seed mode
 * - custom_seed: Numeric seed entered by the user when seed mode is Custom
 */
export interface ImagePayloadInputs {
	/** "auto" lets the backend pick the model; otherwise an exact routing string. */
	model: ImageModelId;
	aspect_ratio: string;
	resolution: Resolution;
	seed: SeedMode;
	custom_seed: number;
	enhance_prompt: "Yes" | "No";
	style?: string;
	setting?: string;
	lighting?: string;
	negative_prompt?: string;
	image_count?: number;
	main_mode?: string;
	sub_mode?: string;
	preserve_structure?: "Yes" | "No";
	preserve_layout?: "Yes" | "No";
	preserve_camera?: "Yes" | "No";
	preserve_materials?: "Yes" | "No";
	change_scope?: string;
	reference_strength?: string;
	planning_target?: string;
	planning_buildings?: string[];
	floorplan_objective?: string;
	floorplan_style?: string;
	floorplan_room_type?: string;
	floorplan_coloring?: string;
	floorplan_prompt?: string;
	exterior_building_type?: string;
	exterior_building_subtype?: string;
	trees_flowers?: string;
	people_activities?: string;
	pavement_site?: string;
	detailed_description?: string;
	style_image_type?: string;
	floorplan3d_angle?: string;
	floorplan3d_type?: string;
	floorplan3d_style_design?: string;
	floorplan3d_lighting?: string;
	floorplan3d_color_palette?: string;
	roomview_angle?: string;
	roomview_lens?: string;
	roomview_type?: string;
	roomview_style_design?: string;
	roomview_lighting?: string;
	reference_image_url?: string;
	/** Multiple reference images sent together as ONE group per request. */
	reference_image_urls?: string[];
	view_creator_camera_angle?: string;
	draw_area?: string;
	people_number?: string;
	people_age_group?: string;
	people_who?: string;
	people_doing?: string;
	people_appearance_clothing?: string;
	people_appearance_style?: string;
	people_identity_race?: string;
	people_identity_gender?: string;
	image_editor_lighting?: string;
	coloring_subtype?: string;
	coloring_preset_style?: string;
}

// ─── UI Utility ───────────────────────────────────────────────────────────

/** Returns Tailwind w/h classes that visually represent an aspect ratio box. */
export function getRatioBoxClass(ratio: AspectRatio): string {
	const map: Partial<Record<AspectRatio, string>> = {
		"1:1": "w-4 h-4",
		"1:4": "w-2 h-5",
		"1:8": "w-1.5 h-5",
		"2:3": "w-3 h-4",
		"3:2": "w-4 h-3",
		"3:4": "w-3 h-4",
		"4:1": "w-5 h-2",
		"4:3": "w-4 h-3",
		"4:5": "w-4 h-5",
		"5:4": "w-5 h-4",
		"8:1": "w-5 h-1.5",
		"9:16": "w-3 h-5",
		"16:9": "w-5 h-3",
		"21:9": "w-5 h-2",
	};
	return map[ratio] ?? "w-4 h-3";
}
