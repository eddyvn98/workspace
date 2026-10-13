import {
	CAMERA_ANGLE_NEW_OPTIONS,
	COLORING_PRESET_STYLE_OPTIONS,
	COLORING_STYLES,
	COLORING_TYPE_OPTIONS,
	EXTERIOR_BUILDING_CATEGORIES,
	COLOR_PALETTE_OPTIONS,
	FLOOR_PLAN_3D_ANGLE_OPTIONS,
	FLOOR_PLAN_3D_TYPE_OPTIONS,
	FLOOR_PLAN_3D_STYLE_DESIGN_OPTIONS,
	FLOOR_PLAN_3D_LIGHTING_OPTIONS,
	FLOOR_PLAN_STYLES,
	IMAGE_EDITOR_LIGHTING_OPTIONS,
	INTERIOR_LIGHTING_OPTIONS,
	INTERIOR_STYLE_OPTIONS,
	LANDSCAPE_TYPE_GROUPS,
	LANDSCAPE_STYLE_OPTIONS,
	LENS_OPTIONS,
	LIGHTING_OPTIONS,
	PLANNING_CONTEXT_OPTIONS,
	PLANNING_STYLE_OPTIONS,
	ROOM_TYPES,
	ROOM_VIEW_ANGLE_OPTIONS,
	ROOM_VIEW_TYPE_OPTIONS,
	ROOM_VIEW_STYLE_DESIGN_OPTIONS,
	ROOM_VIEW_LIGHTING_OPTIONS,
	SETTING_OPTIONS,
	STYLE_IMAGE_OPTIONS,
	STYLE_OPTIONS,
	TREES_FLOWERS_OPTIONS,
	PEOPLE_ACTIVITIES_OPTIONS,
	PAVEMENT_SITE_OPTIONS,
	PEOPLE_NUMBER_OPTIONS,
	PEOPLE_AGE_GROUP_OPTIONS,
	PEOPLE_WHO_OPTIONS,
	PEOPLE_DOING_OPTIONS,
	PEOPLE_CLOTHING_OPTIONS,
	PEOPLE_STYLE_OPTIONS,
	PEOPLE_RACE_OPTIONS,
	PEOPLE_GENDER_OPTIONS,
} from "@/components/features/chat/image-preferences/image-preference.constants";
import { INTERIOR_ROOM_GROUPS, PLANNING_TYPE_GROUPS } from "@/components/features/chat/image-preferences/grouped-type-options";
import type { ImagePayloadInputs } from "@/types/image-generation.types";

type FieldKey = Exclude<keyof ImagePayloadInputs, "model" | "aspect_ratio" | "resolution" | "image_count" | "main_mode" | "sub_mode">;
export type ImageFlowChoice = { value: string; label: string; group?: string; thumbnail?: string };
export type ImageFlowField = {
	key: FieldKey;
	label: string;
	multiline?: boolean;
	editable?: boolean;
	multiple?: boolean;
	layout?: "grid" | "list";
	choice?: string[];
	choices?: ImageFlowChoice[];
	categoryKey?: FieldKey;
};

const choices = (items: readonly { value: string; label: string; group?: string; thumbnail?: string }[]): ImageFlowChoice[] =>
	items.map(({ value, label, group, thumbnail }) => ({ value, label, group, thumbnail }));

const groupedChoices = (groups: readonly { value: string; label: string; subtypes: readonly { value: string; label: string; thumbnail?: string }[] }[]): ImageFlowChoice[] =>
	groups.flatMap((group) => group.subtypes.map((item) => ({ ...item, group: group.label })));

const buildingTypes = groupedChoices(EXTERIOR_BUILDING_CATEGORIES);
const interiorRooms = groupedChoices(INTERIOR_ROOM_GROUPS);
const planningTargets = groupedChoices(PLANNING_TYPE_GROUPS);
const landscapeTypes = groupedChoices(LANDSCAPE_TYPE_GROUPS);
const preserveFields: ImageFlowField[] = [
	{ key: "preserve_structure", label: "Preserve Structure", choice: ["Yes", "No"] },
	{ key: "preserve_layout", label: "Preserve Layout", choice: ["Yes", "No"] },
	{ key: "preserve_camera", label: "Preserve Camera", choice: ["Yes", "No"] },
	{ key: "preserve_materials", label: "Preserve Materials", choice: ["Yes", "No"] },
	{ key: "change_scope", label: "Change Scope" },
	{ key: "reference_strength", label: "Reference Strength" },
];
const withPreserveFields = (fields: ImageFlowField[]) => {
	const trailingPrompts = new Set(["detailed_description", "negative_prompt", "floorplan_prompt"]);
	const promptFields = fields.filter((field) => trailingPrompts.has(field.key));
	const optionFields = fields.filter((field) => !trailingPrompts.has(field.key));
	return [...optionFields, ...preserveFields, ...promptFields];
};

export function getModeOptionFields(mainMode?: string, subMode?: string): ImageFlowField[] {
	if (mainMode === "Generate Image") {
		const common = [{ key: "style_image_type", label: "Style Image", choices: choices(STYLE_IMAGE_OPTIONS) } satisfies ImageFlowField];
		if (subMode === "ARCHITECTURE") return withPreserveFields([
			...common,
			{ key: "exterior_building_subtype", categoryKey: "exterior_building_type", label: "Building Type", choices: buildingTypes },
			{ key: "style", label: "Style", choices: choices(STYLE_OPTIONS), editable: true },
			{ key: "setting", label: "Background", choices: choices(SETTING_OPTIONS), editable: true },
			{ key: "lighting", label: "Environment", choices: choices(LIGHTING_OPTIONS), multiple: true },
			{ key: "trees_flowers", label: "Trees & Flowers", choices: choices(TREES_FLOWERS_OPTIONS), editable: true, layout: "list" },
			{ key: "people_activities", label: "People & Activities", choices: choices(PEOPLE_ACTIVITIES_OPTIONS), editable: true, layout: "list" },
			{ key: "pavement_site", label: "Pavement / Site", choices: choices(PAVEMENT_SITE_OPTIONS), editable: true, layout: "list" },
			{ key: "detailed_description", label: "Detailed Description", multiline: true },
			{ key: "negative_prompt", label: "Negative Prompt", multiline: true },
		]);
		if (subMode === "INTERIOR") return withPreserveFields([
			...common,
			{ key: "setting", label: "Room Type", choices: interiorRooms },
			{ key: "style", label: "Style", choices: choices(INTERIOR_STYLE_OPTIONS), editable: true },
			{ key: "lighting", label: "Environment", choices: choices(INTERIOR_LIGHTING_OPTIONS), multiple: true },
			{ key: "negative_prompt", label: "Negative Prompt", multiline: true },
		]);
		if (subMode === "URBAN PLANNING") return withPreserveFields([
			...common,
			{ key: "planning_target", label: "Type", choices: planningTargets },
			{ key: "style", label: "Style", choices: choices(PLANNING_STYLE_OPTIONS), editable: true },
			{ key: "setting", label: "Background", choices: choices(PLANNING_CONTEXT_OPTIONS), editable: true },
			{ key: "lighting", label: "Environment", choices: choices(LIGHTING_OPTIONS), multiple: true },
			{ key: "negative_prompt", label: "Negative Prompt", multiline: true },
		]);
		if (subMode === "LANDSCAPE") return withPreserveFields([
			...common,
			{ key: "planning_target", label: "Type", choices: landscapeTypes },
			{ key: "style", label: "Style", choices: choices(LANDSCAPE_STYLE_OPTIONS), editable: true },
			{ key: "lighting", label: "Environment", choices: choices(LIGHTING_OPTIONS), multiple: true },
			{ key: "negative_prompt", label: "Negative Prompt", multiline: true },
		]);
		if (subMode === "FLOOR PLAN") return withPreserveFields([
			{ key: "floorplan_objective", label: "Objective", choice: ["3D", "Colorize"] },
			{ key: "floorplan_style", label: "Floor Plan Style", choices: choices(FLOOR_PLAN_STYLES) },
			{ key: "floorplan_room_type", label: "Room Type", choices: choices(ROOM_TYPES) },
			{ key: "floorplan_coloring", label: "Coloring", choices: choices(COLORING_STYLES) },
			{ key: "floorplan_prompt", label: "Floor Plan Prompt", multiline: true },
			{ key: "negative_prompt", label: "Negative Prompt", multiline: true },
		]);
		if (subMode === "3D FLOOR PLAN") return withPreserveFields([
			{ key: "floorplan3d_angle", label: "Style Image Angle", choices: choices(FLOOR_PLAN_3D_ANGLE_OPTIONS) },
			{ key: "floorplan3d_type", label: "Type", choices: choices(FLOOR_PLAN_3D_TYPE_OPTIONS) },
			{ key: "floorplan3d_style_design", label: "Style Design", choices: choices(FLOOR_PLAN_3D_STYLE_DESIGN_OPTIONS) },
			{ key: "floorplan3d_lighting", label: "Lighting", choices: choices(FLOOR_PLAN_3D_LIGHTING_OPTIONS) },
			{ key: "floorplan3d_color_palette", label: "Color Palette", choices: choices(COLOR_PALETTE_OPTIONS) },
		]);
		if (subMode === "FLOOR PLAN TO 3D VIEW ROOM") return withPreserveFields([
			{ key: "roomview_angle", label: "Style Image Angle", choices: choices(ROOM_VIEW_ANGLE_OPTIONS) },
			{ key: "roomview_lens", label: "Lens", choices: choices(LENS_OPTIONS) },
			{ key: "roomview_type", label: "Type", choices: choices(ROOM_VIEW_TYPE_OPTIONS) },
			{ key: "roomview_style_design", label: "Style Design", choices: choices(ROOM_VIEW_STYLE_DESIGN_OPTIONS) },
			{ key: "roomview_lighting", label: "Lighting", choices: choices(ROOM_VIEW_LIGHTING_OPTIONS) },
		]);
	}
	if (mainMode === "View Creator" && subMode === "Create 1 new camera angle") return withPreserveFields([
		{ key: "view_creator_camera_angle", label: "Camera Angle", choices: choices(CAMERA_ANGLE_NEW_OPTIONS) },
	]);
	if (mainMode === "View Creator" && subMode === "Create multiple view with multiple prompt") return [];
	if (mainMode === "Image Editor" && subMode?.startsWith("Add/Remove/Replace")) return withPreserveFields([
		{ key: "draw_area", label: "Draw Area", choice: ["Entire image", "Masked area only", "Background"] },
		{ key: "people_number", label: "People: Number", choices: choices(PEOPLE_NUMBER_OPTIONS) },
		{ key: "people_age_group", label: "People: Age Group", choices: choices(PEOPLE_AGE_GROUP_OPTIONS) },
		{ key: "people_who", label: "People: Who", choices: choices(PEOPLE_WHO_OPTIONS) },
		{ key: "people_doing", label: "People: Activity", choices: choices(PEOPLE_DOING_OPTIONS) },
		{ key: "people_appearance_clothing", label: "People: Clothing", choices: choices(PEOPLE_CLOTHING_OPTIONS) },
		{ key: "people_appearance_style", label: "People: Style", choices: choices(PEOPLE_STYLE_OPTIONS) },
		{ key: "people_identity_race", label: "People: Race / Ethnicity", choices: choices(PEOPLE_RACE_OPTIONS) },
		{ key: "people_identity_gender", label: "People: Gender", choices: choices(PEOPLE_GENDER_OPTIONS) },
	]);
	if (mainMode === "Image Editor" && subMode === "Lighting") return withPreserveFields([
		{ key: "image_editor_lighting", label: "Lighting Mode", choices: choices(IMAGE_EDITOR_LIGHTING_OPTIONS) },
		{ key: "style", label: "Lighting Parameters", multiline: true },
	]);
	if (mainMode === "Image Editor" && (subMode === "Material" || subMode === "Watermark, Logo")) return withPreserveFields([
		{ key: "detailed_description", label: subMode === "Material" ? "Material Description" : "Watermark / Logo Prompt", multiline: true },
	]);
	if (mainMode === "Image Editor" && subMode?.startsWith("Insert Building")) return withPreserveFields([
		{ key: "detailed_description", label: "Placement Instructions", multiline: true },
	]);
	if (mainMode === "Other Tools" && subMode === "Coloring") return withPreserveFields([
		{ key: "coloring_subtype", label: "Coloring Type", choices: choices(COLORING_TYPE_OPTIONS) },
		{ key: "coloring_preset_style", label: "Preset Style", choices: choices(COLORING_PRESET_STYLE_OPTIONS) },
	]);
	if (mainMode === "Other Tools") return withPreserveFields([
		{ key: "detailed_description", label: "Detailed Configuration", multiline: true },
	]);
	return [];
}

export function getImageFlowModeLimitation(mainMode?: string, subMode?: string): string | undefined {
	if (mainMode === "View Creator" && subMode === "Create multiple view with multiple prompt") return "Multi-view needs separate prompt rows, which this flow cannot send yet.";
	if (mainMode === "Image Editor" && subMode?.startsWith("Add/Remove/Replace")) return "Add/Remove/Replace needs the painted selection mask; this flow can send a reference image and prompt, but not the mask yet.";
	if (mainMode === "Image Editor" && subMode?.startsWith("Insert Building")) return "Insert Building needs separate background and transparent building inputs; this flow does not identify those image roles yet.";
	return undefined;
}
