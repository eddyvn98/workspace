import { create } from "zustand";
import { toast } from "sonner";
import type { IImage } from "@/interface/IImages";
import {
	AspectRatio,
	ImageModel,
	MAX_IMAGE_INPUTS,
	ImagePayloadInputs,
	Resolution,
	SeedMode,
	ALL_MODELS,
	ALL_RESOLUTIONS,
	MODEL_ASPECT_RATIOS,
	MODEL_LABELS,
	MODEL_RESOLUTIONS,
	getModelMaxInputImages,
} from "@/types/image-generation.types";

export type LastChangedBy = "model" | "ratio" | "resolution";
export type MainMode = "Generate Image" | "View Creator" | "Image Editor" | "Other Tools";

export const SUB_MODES: Record<MainMode, string[]> = {
	"Generate Image": ["ARCHITECTURE", "INTERIOR", "URBAN PLANNING", "LANDSCAPE", "3D FLOOR PLAN", "FLOOR PLAN TO 3D VIEW ROOM", "FLOOR PLAN"],
	"View Creator": ["Create 1 new camera angle", "Create multiple view with multiple prompt"],
	"Image Editor": [
		"Add/Remove/Replace the object (furniture, item, people, tree, ...) by Selection Area and input the description or PNG",
		"Insert Building to Site (Add a new building to the area highlighted existing image)",
		"Material",
		"Lighting",
		"Watermark, Logo"
	],
	"Other Tools": [
		"Coloring",
		"VR360",
		"Texture Material",
		"Drawing Technical",
		"Analysis Architecture",
		"3D Section Perspective",
		"Expand View",
		"Resolution",
		"Render Enhance"
	]
};

export const DEFAULT_NEGATIVE_PROMPT = "Cartoon, anime, illustration, stylized, unreal, fake, plastic, toy-like, CGI look, game graphics, low-res, blurry, noisy, oversharpen, AI artifacts, painterly textures, waxy surfaces, distorted perspective, bent vertical lines, fisheye lens, warped geometry, bad geometry, melted furniture, floating objects, duplicated objects, wrong scale, clutter, messy decor, random extra decor, changed layout, moved furniture, changed camera angle, overexposed, underexposed, harsh contrast, strong color cast, watermark, text, logo, frame.";

export const DEFAULT_ARCHITECTURE_NEGATIVE_PROMPT = "Cartoon, anime, illustration, stylized, unreal, fake, plastic, toy-like, CGI look, game graphics, low-res, blurry, noisy, oversharpen, AI artifacts, painterly textures, waxy surfaces, distorted perspective, bent vertical lines, fisheye lens, warped geometry, bad geometry, overexposed, underexposed, harsh contrast, strong color cast, watermark, text, logo, frame.";

export const DEFAULT_INTERIOR_NEGATIVE_PROMPT = "Cartoon, anime, illustration, stylized, unreal, fake, plastic, toy-like, CGI look, game graphics, low-res, blurry, noisy, oversharpen, AI artifacts, painterly textures, waxy surfaces, distorted perspective, bent vertical lines, warped geometry, bad geometry, melted furniture, floating objects, duplicated objects, wrong scale, clutter, messy decor, random extra decor, changed layout, moved furniture, overexposed, underexposed, harsh contrast, strong color cast, watermark, text, logo, frame.";

export const DEFAULT_PLANNING_NEGATIVE_PROMPT = "Cartoon, anime, illustration, stylized, unreal, fake, plastic, toy-like, CGI look, game graphics, low-res, blurry, noisy, oversharpen, AI artifacts, painterly textures, waxy surfaces, distorted perspective, overexposed, underexposed, harsh contrast, strong color cast, watermark, text, logo, frame.";

export const DEFAULT_FLOORPLAN_NEGATIVE_PROMPT = "3D render, realistic photo, perspective view, furniture, low-res, blurry, noisy, watermark, text, logo, frame.";

export const DEFAULT_LANDSCAPE_NEGATIVE_PROMPT = "Cartoon, anime, illustration, stylized, unreal, fake, plastic, toy-like, CGI look, game graphics, low-res, blurry, noisy, oversharpen, AI artifacts, painterly textures, distorted perspective, overexposed, underexposed, harsh contrast, strong color cast, watermark, text, logo, frame, indoor, interior.";

export interface MultiViewEntry {
	id: string;
	label: string;
	prompt: string;
}

interface ImageSettingsState {
	// ── Settings ────────────────────────────────────────────────────────────
	imageModel: ImageModel;
	imageAspectRatio: AspectRatio;
	imageResolution: Resolution;
	seedMode: SeedMode;
	customSeed: number;
	enhancePrompt: boolean;

	// ── Advanced Options ────────────────────────────────────────────────────
	style: string;
	setting: string;
	lighting: string;
	styleImageType: string;
	negativePrompt: string;
	architectureNegativePrompt: string;
	interiorNegativePrompt: string;
	planningNegativePrompt: string;
	floorplanNegativePrompt: string;
	landscapeNegativePrompt: string;
	imageCount: number;
	preserveStructure: boolean;
	preserveLayout: boolean;
	preserveCamera: boolean;
	preserveMaterials: boolean;
	changeScope: string;
	referenceStrength: string;
	planningTarget: string;
	planningBuildings: string[];
	floorplanObjective: "3D" | "Colorize";
	floorplanStyle: string;
	floorplanRoomType: string;
	floorplanColoring: string;
	floorplanPrompt: string;
	exteriorBuildingType: string;
	exteriorBuildingSubtype: string;
	treesFlowers: string;
	peopleActivities: string;
	pavementSite: string;
	detailedDescription: string;
	floorPlan3dAngle: string;
	floorPlan3dType: string;
	floorPlan3dStyleDesign: string;
	floorPlan3dLighting: string;
	floorPlan3dColorPalette: string;
	roomViewAngle: string;
	roomViewLens: string;
	roomViewType: string;
	roomViewStyleDesign: string;
	roomViewLighting: string;
	viewCreatorCameraAngle: string;
	drawArea: string;
	peopleNumber: string;
	peopleAgeGroup: string;
	peopleWho: string;
	peopleDoing: string;
	peopleAppearanceClothing: string;
	peopleAppearanceStyle: string;
	peopleIdentityRace: string;
	peopleIdentityGender: string;
	imageEditorLighting: string;
	coloringSubtype: string;
	coloringPresetStyle: string;

	// ── Mode Navigation ─────────────────────────────────────────────────────
	mainMode: MainMode;
	subMode: string;

	// ── Reference Image ─────────────────────────────────────────────────────
	// Legacy single-reference fields — still used internally by Pair Canvas
	// (one reference per job) and by History Flow's View Creator branch root.
	referenceImageUrl: string;
	referenceImagePreviewUrl: string;
	referenceImageName: string;
	setReferenceImage: (url: string, previewUrl: string, name: string) => void;
	clearReferenceImage: () => void;

	/** Multiple reference images uploaded from the composer. They are sent
	 *  together as one group per request — M main images x this ONE group x
	 *  P variants, never multiplied per reference image. Takes priority over
	 *  the legacy single-reference fields above when non-empty. */
	referenceImages: IImage[];
	uploadReferenceImages: (files: FileList | File[], maxImages?: number) => Promise<void>;
	deleteReferenceImage: (id: string, fileName: string) => Promise<void>;
	clearReferenceImages: () => void;
	addExternalReferenceImage: (url: string, name: string) => void;

	/** Image explicitly selected in History Flow — the branch root for View
	 *  Creator. Kept separate from referenceImageUrl (manual upload) so that
	 *  browsing history never leaks a reference image into unrelated modes. */
	historyBaseImageUrl: string;
	setHistoryBaseImageUrl: (url: string) => void;

	// ── Internal UI state ───────────────────────────────────────────────────
	previousResolution: Resolution;
	show4KConfirm: boolean;
	showAdvancedImageOptions: boolean;
	advancedOptionsEnabled: boolean;
	/** Which dropdown was most recently changed — drives display filtering in the
	 *  other two dropdowns per the cascade-priority spec. */
	lastChangedBy: LastChangedBy;

	// ── Cascade handlers ────────────────────────────────────────────────────
	/** Change model → snap ratio/resolution to nearest valid for that model. */
	handleChangeModel: (nextModel: ImageModel) => void;
	/** Change aspect ratio → filter models, intersection-snap resolution. */
	handleChangeAspectRatio: (nextRatio: AspectRatio) => void;
	/** Change resolution — shows 4K confirmation dialog when needed. */
	handleChangeResolution: (nextResolution: Resolution) => void;
	/** Apply a resolution immediately (called after 4K confirm). */
	applyResolution: (res: Resolution) => void;

	setSeedMode: (mode: SeedMode) => void;
	setEnhancePrompt: (value: boolean) => void;
	handleCustomSeedChange: (value: string) => void;
	confirm4K: () => void;
	cancel4K: () => void;
	setShowAdvancedImageOptions: (value: boolean) => void;
	setAdvancedOptionsEnabled: (value: boolean) => void;

	// ── Advanced Option Setters ─────────────────────────────────────────────
	setStyle: (style: string) => void;
	setSetting: (setting: string) => void;
	setLighting: (lighting: string) => void;
	setStyleImageType: (value: string) => void;
	setNegativePrompt: (negativePrompt: string) => void;
	setArchitectureNegativePrompt: (val: string) => void;
	setInteriorNegativePrompt: (val: string) => void;
	setPlanningNegativePrompt: (val: string) => void;
	setFloorplanNegativePrompt: (val: string) => void;
	setLandscapeNegativePrompt: (val: string) => void;
	setImageCount: (count: number) => void;
	setPreserveStructure: (value: boolean) => void;
	setPreserveLayout: (value: boolean) => void;
	setPreserveCamera: (value: boolean) => void;
	setPreserveMaterials: (value: boolean) => void;
	setChangeScope: (value: string) => void;
	setReferenceStrength: (value: string) => void;
	setPlanningTarget: (value: string) => void;
	setPlanningBuildings: (value: string[]) => void;
	setFloorplanObjective: (value: "3D" | "Colorize") => void;
	setFloorplanStyle: (value: string) => void;
	setFloorplanRoomType: (value: string) => void;
	setFloorplanColoring: (value: string) => void;
	setFloorplanPrompt: (value: string) => void;
	setExteriorBuildingType: (value: string) => void;
	setExteriorBuildingSubtype: (value: string) => void;
	setTreesFlowers: (value: string) => void;
	setPeopleActivities: (value: string) => void;
	setPavementSite: (value: string) => void;
	setDetailedDescription: (value: string) => void;
	setFloorPlan3dAngle: (value: string) => void;
	setFloorPlan3dType: (value: string) => void;
	setFloorPlan3dStyleDesign: (value: string) => void;
	setFloorPlan3dLighting: (value: string) => void;
	setFloorPlan3dColorPalette: (value: string) => void;
	setRoomViewAngle: (value: string) => void;
	setRoomViewLens: (value: string) => void;
	setRoomViewType: (value: string) => void;
	setRoomViewStyleDesign: (value: string) => void;
	setRoomViewLighting: (value: string) => void;
	setViewCreatorCameraAngle: (value: string) => void;
	setDrawArea: (value: string) => void;
	setPeopleNumber: (value: string) => void;
	setPeopleAgeGroup: (value: string) => void;
	setPeopleWho: (value: string) => void;
	setPeopleDoing: (value: string) => void;
	setPeopleAppearanceClothing: (value: string) => void;
	setPeopleAppearanceStyle: (value: string) => void;
	setPeopleIdentityRace: (value: string) => void;
	setPeopleIdentityGender: (value: string) => void;
	setImageEditorLighting: (value: string) => void;
	setColoringSubtype: (value: string) => void;
	setColoringPresetStyle: (value: string) => void;
	setMainMode: (mode: MainMode) => void;
	setSubMode: (subMode: string) => void;
	resetSettings: () => void;

	// ── View Creator: multi-view batch ──────────────────────────────────────
	/** One row per view when subMode === "Create multiple view with multiple prompt". */
	multiViews: MultiViewEntry[];
	addMultiView: () => void;
	updateMultiView: (id: string, patch: Partial<Omit<MultiViewEntry, "id">>) => void;
	removeMultiView: (id: string) => void;
	resetMultiViews: () => void;

	// ── Payload builder ─────────────────────────────────────────────────────
	getPayload: () => ImagePayloadInputs;

	/** Restore all store settings from a previously captured payload snapshot. */
	restoreFromPayload: (params: ImagePayloadInputs) => void;
}

export const useImageSettingsStore = create<ImageSettingsState>((set, get) => ({
	imageModel: "Alibaba: Qwen Image 2.0 Pro",
	imageAspectRatio: "4:3",
	imageResolution: "1K",
	seedMode: "Random",
	customSeed: 0,
	enhancePrompt: true,

	style: "",
	setting: "",
	lighting: "",
	styleImageType: "",
	negativePrompt: DEFAULT_NEGATIVE_PROMPT,
	architectureNegativePrompt: DEFAULT_ARCHITECTURE_NEGATIVE_PROMPT,
	interiorNegativePrompt: DEFAULT_INTERIOR_NEGATIVE_PROMPT,
	planningNegativePrompt: DEFAULT_PLANNING_NEGATIVE_PROMPT,
	floorplanNegativePrompt: DEFAULT_FLOORPLAN_NEGATIVE_PROMPT,
	landscapeNegativePrompt: DEFAULT_LANDSCAPE_NEGATIVE_PROMPT,
	imageCount: 2,
	preserveStructure: true,
	preserveLayout: true,
	preserveCamera: false,
	preserveMaterials: false,
	changeScope: "Improve visual quality only",
	referenceStrength: "Medium",
	planningTarget: "",
	planningBuildings: [],
	floorplanObjective: "3D",
	floorplanStyle: "",
	floorplanRoomType: "",
	floorplanColoring: "",
	floorplanPrompt: "",
	exteriorBuildingType: "",
	exteriorBuildingSubtype: "",
	treesFlowers: "",
	peopleActivities: "",
	pavementSite: "",
	detailedDescription: "",
	floorPlan3dAngle: "",
	floorPlan3dType: "",
	floorPlan3dStyleDesign: "",
	floorPlan3dLighting: "",
	floorPlan3dColorPalette: "",
	roomViewAngle: "",
	roomViewLens: "",
	roomViewType: "",
	roomViewStyleDesign: "",
	roomViewLighting: "",
	viewCreatorCameraAngle: "",
	drawArea: "",
	peopleNumber: "",
	peopleAgeGroup: "",
	peopleWho: "",
	peopleDoing: "",
	peopleAppearanceClothing: "",
	peopleAppearanceStyle: "",
	peopleIdentityRace: "",
	peopleIdentityGender: "",
	imageEditorLighting: "",
	coloringSubtype: "",
	coloringPresetStyle: "",

	mainMode: "Generate Image",
	subMode: "ARCHITECTURE",

	multiViews: [
		{ id: "view_1", label: "", prompt: "" },
		{ id: "view_2", label: "", prompt: "" },
	],

	referenceImageUrl: "",
	referenceImagePreviewUrl: "",
	referenceImageName: "",
	referenceImages: [],
	historyBaseImageUrl: "",

	previousResolution: "1K",
	show4KConfirm: false,
	showAdvancedImageOptions: false,
	advancedOptionsEnabled: false,
	lastChangedBy: "model",

	// ── Cascade handlers ────────────────────────────────────────────────────

	handleChangeModel: (nextModel) => {
		const { imageAspectRatio, imageModel, imageResolution } = get();
		if (nextModel === imageModel) return;

		// Snap ratio: keep if the model supports it, otherwise fall back to "4:3"
		const newRatio =
			MODEL_ASPECT_RATIOS[nextModel].includes(imageAspectRatio)
				? imageAspectRatio
				: ("4:3" as AspectRatio);

		// Snap resolution: keep if the model supports it.
		// When leaving 4K for a model that does not support it, fall back to 2K
		// explicitly per business requirement; otherwise take first valid.
		const validResolutions = MODEL_RESOLUTIONS[nextModel];
		const newRes = validResolutions.includes(imageResolution)
			? imageResolution
			: imageResolution === "4K" && validResolutions.includes("2K")
				? "2K"
				: validResolutions[0];

		set({
			imageModel: nextModel,
			imageAspectRatio: newRatio,
			imageResolution: newRes,
			lastChangedBy: "model",
		});

		const maxImageInputs = getModelMaxInputImages(nextModel);
		toast.info(`${MODEL_LABELS[nextModel]} selected`, {
			description: `Up to ${maxImageInputs} total input images (main + reference).`,
		});
	},

	handleChangeAspectRatio: (nextRatio) => {
		const { imageModel, imageResolution } = get();

		// Models that support this ratio (Auto always supports all 14)
		const validModels = ALL_MODELS.filter((m) =>
			MODEL_ASPECT_RATIOS[m].includes(nextRatio),
		);
		const safeModels = validModels.length > 0 ? validModels : ALL_MODELS;

		// Snap model if the current one no longer supports the ratio
		const newModel = safeModels.includes(imageModel)
			? imageModel
			: safeModels[0];

		// Preserve resolution when the (possibly snapped) model still supports it.
		// This prevents aspect-ratio changes from evicting 4K on Nano Banana 2,
		// satisfying the requirement that ratio and resolution are independent.
		const newRes = MODEL_RESOLUTIONS[newModel].includes(imageResolution)
			? imageResolution
			: MODEL_RESOLUTIONS[newModel][0];

		set({
			imageAspectRatio: nextRatio,
			imageModel: newModel,
			imageResolution: newRes,
			lastChangedBy: "ratio",
		});
	},

	applyResolution: (res) => {
		const { imageModel, imageAspectRatio } = get();

		// Models that support this resolution
		const validModels = ALL_MODELS.filter((m) =>
			MODEL_RESOLUTIONS[m].includes(res),
		);
		const safeModels = validModels.length > 0 ? validModels : ALL_MODELS;

		// Union of ratios from all remaining valid models
		// (this is what AspectRatioSelector will display when lastChangedBy === 'resolution')
		const ratioSet = new Set<AspectRatio>();
		safeModels.forEach((m) =>
			MODEL_ASPECT_RATIOS[m].forEach((r) => ratioSet.add(r)),
		);

		// Snap model if the current one no longer supports this resolution
		const newModel = safeModels.includes(imageModel)
			? imageModel
			: safeModels[0];

		// Snap ratio to "4:3" if not in the union
		const newRatio = ratioSet.has(imageAspectRatio)
			? imageAspectRatio
			: ("4:3" as AspectRatio);

		set({
			imageResolution: res,
			imageModel: newModel,
			imageAspectRatio: newRatio,
			lastChangedBy: "resolution",
		});
	},

	handleChangeResolution: (nextResolution) => {
		if (nextResolution === "4K") {
			// Store previous resolution for Cancel; don't apply yet
			set({ previousResolution: get().imageResolution, show4KConfirm: true });
			return;
		}
		get().applyResolution(nextResolution);
	},

	setSeedMode: (mode) => set({ seedMode: mode }),

	setEnhancePrompt: (value) => set({ enhancePrompt: value }),

	handleCustomSeedChange: (value) => {
		if (value === "") {
			set({ customSeed: 0 });
			return;
		}
		let n = parseInt(value, 10);
		if (isNaN(n)) return;
		if (n < 0) n = 0;
		if (n > 2147483647) n = 2147483647;
		set({ customSeed: n });
	},

	confirm4K: () => {
		set({ show4KConfirm: false });
		get().applyResolution("4K");
	},

	// imageResolution was never changed when the 4K dialog appeared — just hide it
	cancel4K: () => set({ show4KConfirm: false }),

	setReferenceImage: (url, previewUrl, name) => set({ referenceImageUrl: url, referenceImagePreviewUrl: previewUrl, referenceImageName: name }),
	clearReferenceImage: () => set({ referenceImageUrl: "", referenceImagePreviewUrl: "", referenceImageName: "" }),
	setHistoryBaseImageUrl: (url) => set({ historyBaseImageUrl: url }),

	clearReferenceImages: () => set({ referenceImages: [] }),

	addExternalReferenceImage: (url, name) =>
		set((state) => {
			if (state.referenceImages.length >= MAX_IMAGE_INPUTS) return state;
			return {
				referenceImages: [
					...state.referenceImages,
					{ id: `ext-ref-${Date.now()}-${state.referenceImages.length}`, name, status: "done" as const, url },
				],
			};
		}),

	uploadReferenceImages: async (selectedFiles, maxImages = MAX_IMAGE_INPUTS) => {
		const allFiles = Array.from(selectedFiles);
		const limit = Math.min(maxImages, MAX_IMAGE_INPUTS);
		const remaining = limit - get().referenceImages.length;
		if (remaining <= 0) return;

		const filesToUpload = allFiles.slice(0, remaining);

		for (const file of filesToUpload) {
			if (get().referenceImages.length >= limit) break;

			const tmpId = `ref-${file.name}-${Date.now()}`;
			const extension = file.name.includes(".")
				? `.${file.name.split(".").pop()}`
				: "";
			const uploadFile = new File([file], `${crypto.randomUUID()}${extension}`, {
				type: file.type,
				lastModified: file.lastModified,
			});

			set((state) => ({
				referenceImages: [
					...state.referenceImages,
					{ id: tmpId, name: file.name, status: "uploading" as const, url: "" },
				],
			}));

			try {
				const formData = new FormData();
				formData.append("Image", uploadFile);

				const uploadRes = await fetch("/api/oss", {
					method: "POST",
					body: formData,
				});
				const uploadData = await uploadRes.json();

				if (uploadRes.ok && uploadData.url) {
					set((state) => ({
						referenceImages: state.referenceImages.map((f) =>
							f.id === tmpId ? { ...f, status: "done" as const, url: uploadData.url } : f,
						),
					}));
				} else {
					set((state) => ({
						referenceImages: state.referenceImages.map((f) =>
							f.id === tmpId ? { ...f, status: "error" as const } : f,
						),
					}));
				}
			} catch {
				set((state) => ({
					referenceImages: state.referenceImages.map((f) =>
						f.id === tmpId ? { ...f, status: "error" as const } : f,
					),
				}));
			}
		}
	},

	deleteReferenceImage: async (id, fileName) => {
		if (id.startsWith("ext-ref-")) {
			set((state) => ({
				referenceImages: state.referenceImages.filter((img) => img.id !== id),
			}));
			return;
		}

		set((state) => ({
			referenceImages: state.referenceImages.filter((img) => img.id !== id),
		}));

		try {
			const res = await fetch("/api/oss", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fileName }),
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete reference image");
			}
		} catch (error) {
			console.warn("OSS cleanup failed; reference image was removed from this prompt:", error);
		}
	},

	setShowAdvancedImageOptions: (value) => set({ showAdvancedImageOptions: value }),
	setAdvancedOptionsEnabled: (value) => set({ advancedOptionsEnabled: value }),

	// ── Advanced Option Setters ─────────────────────────────────────────────
	setStyle: (style) => set({ style }),
	setSetting: (setting) => set({ setting }),
	setLighting: (lighting) => set({ lighting }),
	setStyleImageType: (value) => set({ styleImageType: value }),
	setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
	setArchitectureNegativePrompt: (architectureNegativePrompt) => set({ architectureNegativePrompt }),
	setInteriorNegativePrompt: (interiorNegativePrompt) => set({ interiorNegativePrompt }),
	setPlanningNegativePrompt: (planningNegativePrompt) => set({ planningNegativePrompt }),
	setFloorplanNegativePrompt: (floorplanNegativePrompt) => set({ floorplanNegativePrompt }),
	setLandscapeNegativePrompt: (landscapeNegativePrompt) => set({ landscapeNegativePrompt }),
	setImageCount: (count) => set({ imageCount: count }),
	setPreserveStructure: (value) => set({ preserveStructure: value }),
	setPreserveLayout: (value) => set({ preserveLayout: value }),
	setPreserveCamera: (value) => set({ preserveCamera: value }),
	setPreserveMaterials: (value) => set({ preserveMaterials: value }),
	setChangeScope: (value) => set({ changeScope: value }),
	setReferenceStrength: (value) => set({ referenceStrength: value }),
	setPlanningTarget: (value) => set({ planningTarget: value }),
	setPlanningBuildings: (value) => set({ planningBuildings: value }),
	setFloorplanObjective: (value) => set({ floorplanObjective: value }),
	setFloorplanStyle: (value) => set({ floorplanStyle: value }),
	setFloorplanRoomType: (value) => set({ floorplanRoomType: value }),
	setFloorplanColoring: (value) => set({ floorplanColoring: value }),
	setFloorplanPrompt: (value) => set({ floorplanPrompt: value }),
	setExteriorBuildingType: (value) => set({ exteriorBuildingType: value }),
	setExteriorBuildingSubtype: (value) => set({ exteriorBuildingSubtype: value }),
	setTreesFlowers: (value) => set({ treesFlowers: value }),
	setPeopleActivities: (value) => set({ peopleActivities: value }),
	setPavementSite: (value) => set({ pavementSite: value }),
	setDetailedDescription: (value) => set({ detailedDescription: value }),
	setFloorPlan3dAngle: (value) => set({ floorPlan3dAngle: value }),
	setFloorPlan3dType: (value) => set({ floorPlan3dType: value }),
	setFloorPlan3dStyleDesign: (value) => set({ floorPlan3dStyleDesign: value }),
	setFloorPlan3dLighting: (value) => set({ floorPlan3dLighting: value }),
	setFloorPlan3dColorPalette: (value) => set({ floorPlan3dColorPalette: value }),
	setRoomViewAngle: (value) => set({ roomViewAngle: value }),
	setRoomViewLens: (value) => set({ roomViewLens: value }),
	setRoomViewType: (value) => set({ roomViewType: value }),
	setRoomViewStyleDesign: (value) => set({ roomViewStyleDesign: value }),
	setRoomViewLighting: (value) => set({ roomViewLighting: value }),
	setViewCreatorCameraAngle: (value) => set({ viewCreatorCameraAngle: value }),
	setDrawArea: (value) => set({ drawArea: value }),
	setPeopleNumber: (value) => set({ peopleNumber: value }),
	setPeopleAgeGroup: (value) => set({ peopleAgeGroup: value }),
	setPeopleWho: (value) => set({ peopleWho: value }),
	setPeopleDoing: (value) => set({ peopleDoing: value }),
	setPeopleAppearanceClothing: (value) => set({ peopleAppearanceClothing: value }),
	setPeopleAppearanceStyle: (value) => set({ peopleAppearanceStyle: value }),
	setPeopleIdentityRace: (value) => set({ peopleIdentityRace: value }),
	setPeopleIdentityGender: (value) => set({ peopleIdentityGender: value }),
	setImageEditorLighting: (value) => set({ imageEditorLighting: value }),
	setColoringSubtype: (value) => set({ coloringSubtype: value }),
	setColoringPresetStyle: (value) => set({ coloringPresetStyle: value }),
	setMainMode: (mode) => set({ mainMode: mode, subMode: SUB_MODES[mode][0] ?? "" }),
	setSubMode: (subMode) => set({ subMode }),

	// ── View Creator: multi-view batch ──────────────────────────────────────
	addMultiView: () =>
		set((state) => ({
			multiViews: [
				...state.multiViews,
				{ id: `view_${Date.now()}_${state.multiViews.length}`, label: "", prompt: "" },
			],
		})),
	updateMultiView: (id, patch) =>
		set((state) => ({
			multiViews: state.multiViews.map((v) => (v.id === id ? { ...v, ...patch } : v)),
		})),
	removeMultiView: (id) =>
		set((state) => ({
			multiViews: state.multiViews.filter((v) => v.id !== id),
		})),
	resetMultiViews: () =>
		set({
			multiViews: [
				{ id: "view_1", label: "", prompt: "" },
				{ id: "view_2", label: "", prompt: "" },
			],
		}),
	resetSettings: () => set({
		style: "",
		setting: "",
		lighting: "",
		styleImageType: "",
		negativePrompt: DEFAULT_NEGATIVE_PROMPT,
		architectureNegativePrompt: DEFAULT_ARCHITECTURE_NEGATIVE_PROMPT,
		interiorNegativePrompt: DEFAULT_INTERIOR_NEGATIVE_PROMPT,
		planningNegativePrompt: DEFAULT_PLANNING_NEGATIVE_PROMPT,
		floorplanNegativePrompt: DEFAULT_FLOORPLAN_NEGATIVE_PROMPT,
		landscapeNegativePrompt: DEFAULT_LANDSCAPE_NEGATIVE_PROMPT,
		imageCount: 2,
		imageModel: "Alibaba: Qwen Image 2.0 Pro",
		imageAspectRatio: "4:3",
		imageResolution: "1K",
		seedMode: "Random",
		customSeed: 0,
		enhancePrompt: true,
		preserveStructure: true,
		preserveLayout: true,
		preserveCamera: false,
		preserveMaterials: false,
		changeScope: "Improve visual quality only",
		referenceStrength: "Medium",
		planningTarget: "",
		planningBuildings: [],
		floorplanObjective: "3D",
		floorplanStyle: "",
		floorplanRoomType: "",
		floorplanColoring: "",
		floorplanPrompt: "",
		exteriorBuildingType: "",
		exteriorBuildingSubtype: "",
		treesFlowers: "",
		peopleActivities: "",
		pavementSite: "",
		detailedDescription: "",
		floorPlan3dAngle: "",
		floorPlan3dType: "",
		floorPlan3dStyleDesign: "",
		floorPlan3dLighting: "",
		floorPlan3dColorPalette: "",
		roomViewAngle: "",
		roomViewLens: "",
		roomViewType: "",
		roomViewStyleDesign: "",
		roomViewLighting: "",
		viewCreatorCameraAngle: "",
		drawArea: "",
		peopleNumber: "",
		peopleAgeGroup: "",
		peopleWho: "",
		peopleDoing: "",
		peopleAppearanceClothing: "",
		peopleAppearanceStyle: "",
		peopleIdentityRace: "",
		peopleIdentityGender: "",
		imageEditorLighting: "",
		coloringSubtype: "",
		coloringPresetStyle: "",
		mainMode: "Generate Image",
		subMode: "ARCHITECTURE",
		showAdvancedImageOptions: false,
		advancedOptionsEnabled: false,
		historyBaseImageUrl: "",
	}),

	// ── Payload builder ─────────────────────────────────────────────────────

	getPayload: (): ImagePayloadInputs => {
		const {
			imageModel,
			imageAspectRatio,
			imageResolution,
			seedMode,
			customSeed,
			enhancePrompt,
			style,
			setting,
			lighting,
			styleImageType,
			negativePrompt,
			architectureNegativePrompt,
			interiorNegativePrompt,
			planningNegativePrompt,
			floorplanNegativePrompt,
			landscapeNegativePrompt,
			imageCount,
			mainMode,
			subMode,
			preserveStructure,
			preserveLayout,
			preserveCamera,
			preserveMaterials,
			changeScope,
			referenceStrength,
			planningTarget,
			planningBuildings,
			floorplanObjective,
			floorplanStyle,
			floorplanRoomType,
			floorplanColoring,
			floorplanPrompt,
			exteriorBuildingType,
			exteriorBuildingSubtype,
			treesFlowers,
			peopleActivities,
			pavementSite,
			detailedDescription,
			floorPlan3dAngle,
			floorPlan3dType,
			floorPlan3dStyleDesign,
			floorPlan3dLighting,
			floorPlan3dColorPalette,
			roomViewAngle,
			roomViewLens,
			roomViewType,
			roomViewStyleDesign,
			roomViewLighting,
			referenceImageUrl,
			referenceImages,
			historyBaseImageUrl,
			viewCreatorCameraAngle,
			drawArea,
			peopleNumber,
			peopleAgeGroup,
			peopleWho,
			peopleDoing,
			peopleAppearanceClothing,
			peopleAppearanceStyle,
			peopleIdentityRace,
			peopleIdentityGender,
			imageEditorLighting,
			coloringSubtype,
			coloringPresetStyle,
		} = get();

		let finalNegativePrompt = negativePrompt;
		if (subMode === "ARCHITECTURE") {
			finalNegativePrompt = architectureNegativePrompt;
		} else if (subMode === "INTERIOR") {
			finalNegativePrompt = interiorNegativePrompt;
		} else if (subMode === "URBAN PLANNING") {
			finalNegativePrompt = planningNegativePrompt;
		} else if (subMode === "FLOOR PLAN") {
			finalNegativePrompt = floorplanNegativePrompt;
		} else if (subMode === "LANDSCAPE") {
			finalNegativePrompt = landscapeNegativePrompt;
		}

		return {
			model: imageModel,
			aspect_ratio: imageAspectRatio,
			resolution: imageResolution,
			seed: seedMode,
			custom_seed: customSeed !== 0 ? customSeed : 0,
			enhance_prompt: enhancePrompt ? "Yes" : "No",
			...(style ? { style } : {}),
			...(setting ? { setting } : {}),
			...(lighting ? { lighting } : {}),
			...(styleImageType ? { style_image_type: styleImageType } : {}),
			...(finalNegativePrompt ? { negative_prompt: finalNegativePrompt } : {}),
			...(imageCount !== 2 ? { image_count: imageCount } : {}),
			main_mode: mainMode,
			sub_mode: subMode,
			preserve_structure: preserveStructure ? "Yes" : "No",
			preserve_layout: preserveLayout ? "Yes" : "No",
			preserve_camera: preserveCamera ? "Yes" : "No",
			preserve_materials: preserveMaterials ? "Yes" : "No",
			change_scope: changeScope,
			reference_strength: referenceStrength,
			...(planningTarget ? { planning_target: planningTarget } : {}),
			...(planningBuildings.length > 0 ? { planning_buildings: planningBuildings } : {}),
			...(floorplanObjective ? { floorplan_objective: floorplanObjective } : {}),
			...(floorplanStyle ? { floorplan_style: floorplanStyle } : {}),
			...(floorplanRoomType ? { floorplan_room_type: floorplanRoomType } : {}),
			...(floorplanColoring ? { floorplan_coloring: floorplanColoring } : {}),
			...(floorplanPrompt ? { floorplan_prompt: floorplanPrompt } : {}),
			...(subMode === "ARCHITECTURE" && exteriorBuildingType ? { exterior_building_type: exteriorBuildingType } : {}),
			...(subMode === "ARCHITECTURE" && exteriorBuildingSubtype ? { exterior_building_subtype: exteriorBuildingSubtype } : {}),
			...((subMode === "ARCHITECTURE" || subMode === "URBAN PLANNING") && treesFlowers ? { trees_flowers: treesFlowers } : {}),
			...((subMode === "ARCHITECTURE" || subMode === "URBAN PLANNING") && peopleActivities ? { people_activities: peopleActivities } : {}),
			...((subMode === "ARCHITECTURE" || subMode === "URBAN PLANNING") && pavementSite ? { pavement_site: pavementSite } : {}),
			...((subMode === "ARCHITECTURE" || subMode === "URBAN PLANNING") && detailedDescription ? { detailed_description: detailedDescription } : {}),
			...(subMode === "3D FLOOR PLAN" && floorPlan3dAngle ? { floorplan3d_angle: floorPlan3dAngle } : {}),
			...(subMode === "3D FLOOR PLAN" && floorPlan3dType ? { floorplan3d_type: floorPlan3dType } : {}),
			...(subMode === "3D FLOOR PLAN" && floorPlan3dStyleDesign ? { floorplan3d_style_design: floorPlan3dStyleDesign } : {}),
			...(subMode === "3D FLOOR PLAN" && floorPlan3dLighting ? { floorplan3d_lighting: floorPlan3dLighting } : {}),
			...(subMode === "3D FLOOR PLAN" && floorPlan3dColorPalette ? { floorplan3d_color_palette: floorPlan3dColorPalette } : {}),
			...(subMode === "FLOOR PLAN TO 3D VIEW ROOM" && roomViewAngle ? { roomview_angle: roomViewAngle } : {}),
			...(subMode === "FLOOR PLAN TO 3D VIEW ROOM" && roomViewLens ? { roomview_lens: roomViewLens } : {}),
			...(subMode === "FLOOR PLAN TO 3D VIEW ROOM" && roomViewType ? { roomview_type: roomViewType } : {}),
			...(subMode === "FLOOR PLAN TO 3D VIEW ROOM" && roomViewStyleDesign ? { roomview_style_design: roomViewStyleDesign } : {}),
			...(subMode === "FLOOR PLAN TO 3D VIEW ROOM" && roomViewLighting ? { roomview_lighting: roomViewLighting } : {}),
			...((() => {
				// Multiple manually-uploaded reference images are sent together as ONE
				// group per request (M main x this one group x P variants — never
				// multiplied per reference image). Falls back to the legacy single
				// reference field, then to the View Creator branch-root image.
				const manualRefUrls = referenceImages
					.filter((img) => img.status === "done" && img.url)
					.map((img) => img.url);
				if (manualRefUrls.length > 0) {
					return { reference_image_urls: manualRefUrls };
				}
				const effectiveReferenceUrl = referenceImageUrl || (mainMode === "View Creator" ? historyBaseImageUrl : "");
				return effectiveReferenceUrl ? { reference_image_url: effectiveReferenceUrl } : {};
			})()),
			...(viewCreatorCameraAngle ? { view_creator_camera_angle: viewCreatorCameraAngle } : {}),
			...(drawArea ? { draw_area: drawArea } : {}),
			...(peopleNumber ? { people_number: peopleNumber } : {}),
			...(peopleAgeGroup ? { people_age_group: peopleAgeGroup } : {}),
			...(peopleWho ? { people_who: peopleWho } : {}),
			...(peopleDoing ? { people_doing: peopleDoing } : {}),
			...(peopleAppearanceClothing ? { people_appearance_clothing: peopleAppearanceClothing } : {}),
			...(peopleAppearanceStyle ? { people_appearance_style: peopleAppearanceStyle } : {}),
			...(peopleIdentityRace ? { people_identity_race: peopleIdentityRace } : {}),
			...(peopleIdentityGender ? { people_identity_gender: peopleIdentityGender } : {}),
			...(imageEditorLighting ? { image_editor_lighting: imageEditorLighting } : {}),
			...(coloringSubtype ? { coloring_subtype: coloringSubtype } : {}),
			...(coloringPresetStyle ? { coloring_preset_style: coloringPresetStyle } : {}),
		};
	},

	restoreFromPayload: (params) => {
		set({
			imageModel: (params.model && params.model !== "Auto" ? params.model : "Alibaba: Qwen Image 2.0 Pro") as ImageModel,
			imageAspectRatio: (params.aspect_ratio as AspectRatio) ?? "4:3",
			imageResolution: params.resolution ?? "1K",
			seedMode:
				typeof params.seed === "string"
					? (params.seed as SeedMode)
					: params.seed >= 0
						? "Custom"
						: "Random",
			customSeed:
				typeof params.seed === "number" && params.seed >= 0
					? params.seed
					: params.custom_seed ?? 0,
			enhancePrompt: params.enhance_prompt === "Yes",
			style: params.style ?? "",
			setting: params.setting ?? "",
			lighting: params.lighting ?? "",
			styleImageType: params.style_image_type ?? "",
			negativePrompt: params.negative_prompt ?? "",
			imageCount: params.image_count ?? 2,
			mainMode: (params.main_mode as MainMode) ?? "Generate Image",
			subMode: params.sub_mode ?? "ARCHITECTURE",
			preserveStructure: params.preserve_structure === "Yes",
			preserveLayout: params.preserve_layout === "Yes",
			preserveCamera: params.preserve_camera === "Yes",
			preserveMaterials: params.preserve_materials === "Yes",
			changeScope: params.change_scope ?? "Improve visual quality only",
			referenceStrength: params.reference_strength ?? "Medium",
			planningTarget: params.planning_target ?? "",
			planningBuildings: params.planning_buildings ?? [],
			floorplanObjective: (params.floorplan_objective as "3D" | "Colorize") ?? "3D",
			floorplanStyle: params.floorplan_style ?? "",
			floorplanRoomType: params.floorplan_room_type ?? "",
			floorplanColoring: params.floorplan_coloring ?? "",
			floorplanPrompt: params.floorplan_prompt ?? "",
			exteriorBuildingType: params.exterior_building_type ?? "",
			exteriorBuildingSubtype: params.exterior_building_subtype ?? "",
			treesFlowers: params.trees_flowers ?? "",
			peopleActivities: params.people_activities ?? "",
			pavementSite: params.pavement_site ?? "",
			detailedDescription: params.detailed_description ?? "",
			floorPlan3dAngle: params.floorplan3d_angle ?? "",
			floorPlan3dType: params.floorplan3d_type ?? "",
			floorPlan3dStyleDesign: params.floorplan3d_style_design ?? "",
			floorPlan3dLighting: params.floorplan3d_lighting ?? "",
			floorPlan3dColorPalette: params.floorplan3d_color_palette ?? "",
			roomViewAngle: params.roomview_angle ?? "",
			roomViewLens: params.roomview_lens ?? "",
			roomViewType: params.roomview_type ?? "",
			roomViewStyleDesign: params.roomview_style_design ?? "",
			roomViewLighting: params.roomview_lighting ?? "",
			referenceImageUrl: params.reference_image_url ?? "",
			// Restore preview URL so the thumbnail re-appears in the upload zone after Reuse/Retry
			referenceImagePreviewUrl: params.reference_image_url ?? "",
			referenceImageName: params.reference_image_url ? "reference" : "",
			referenceImages:
				params.reference_image_urls && params.reference_image_urls.length > 0
					? params.reference_image_urls.map((url, i) => ({
							id: `restored-ref-${i}-${url}`,
							name: `reference-${i + 1}`,
							status: "done" as const,
							url,
						}))
					: [],
			historyBaseImageUrl: params.reference_image_url ?? "",
			viewCreatorCameraAngle: params.view_creator_camera_angle ?? "",
			drawArea: params.draw_area ?? "",
			peopleNumber: params.people_number ?? "",
			peopleAgeGroup: params.people_age_group ?? "",
			peopleWho: params.people_who ?? "",
			peopleDoing: params.people_doing ?? "",
			peopleAppearanceClothing: params.people_appearance_clothing ?? "",
			peopleAppearanceStyle: params.people_appearance_style ?? "",
			peopleIdentityRace: params.people_identity_race ?? "",
			peopleIdentityGender: params.people_identity_gender ?? "",
			imageEditorLighting: params.image_editor_lighting ?? "",
			coloringSubtype: params.coloring_subtype ?? "",
			coloringPresetStyle: params.coloring_preset_style ?? "",
			advancedOptionsEnabled: false,
		});
	},
}));
