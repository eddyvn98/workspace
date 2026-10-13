import type { ImagePayloadInputs } from "@/types/image-generation.types";

/** Resolves the workflow seed value used for a retry from its saved payload. */
export function resolveImageDifySeed(
	imagePayload: Pick<ImagePayloadInputs, "seed" | "custom_seed">,
): string | number {
	return imagePayload.seed === "Custom"
		? imagePayload.custom_seed
		: imagePayload.seed;
}

/** Maps the internal ImagePayloadInputs snapshot to the PascalCase input variables Dify expects for IMAGE_KEY. */
export function buildImageDifyInputs(imagePayload: ImagePayloadInputs): Record<string, unknown> {
	return {
		Aspect_Ratio: imagePayload.aspect_ratio,
		Models: imagePayload.model,
		Resolution: imagePayload.resolution,
		Seed: imagePayload.seed,
		Custom_Seed: imagePayload.custom_seed,
		Enhance_Prompt: imagePayload.enhance_prompt,
		Style: imagePayload.style,
		Setting: imagePayload.setting,
		Lighting: imagePayload.lighting,
		Negative_Prompt: imagePayload.negative_prompt,
		Image_Count: imagePayload.image_count ?? 2,
		Main_Mode: imagePayload.main_mode,
		Sub_Mode: imagePayload.sub_mode,
		Preserve_Structure: imagePayload.preserve_structure,
		Preserve_Layout: imagePayload.preserve_layout,
		Preserve_Camera: imagePayload.preserve_camera,
		Preserve_Materials: imagePayload.preserve_materials,
		Change_Scope: imagePayload.change_scope,
		Reference_Strength: imagePayload.reference_strength,
		Planning_Target: imagePayload.planning_target,
		Planning_Buildings: imagePayload.planning_buildings,
		Floorplan_Objective: imagePayload.floorplan_objective,
		Floorplan_Style: imagePayload.floorplan_style,
		Floorplan_Room_Type: imagePayload.floorplan_room_type,
		Floorplan_Coloring: imagePayload.floorplan_coloring,
		Floorplan_Prompt: imagePayload.floorplan_prompt,
		Exterior_Building_Type: imagePayload.exterior_building_type,
		Exterior_Building_Subtype: imagePayload.exterior_building_subtype,
		Trees_Flowers: imagePayload.trees_flowers,
		People_Activities: imagePayload.people_activities,
		Pavement_Site: imagePayload.pavement_site,
		Detailed_Description: imagePayload.detailed_description,
		// Reference_Image is a scalar legacy workflow variable. All reference
		// images travel in files[]; retain only the first URL here for compatibility.
		Reference_Image:
			imagePayload.reference_image_urls?.[0] ?? imagePayload.reference_image_url,
	};
}
