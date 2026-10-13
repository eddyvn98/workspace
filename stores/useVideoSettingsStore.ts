import { create } from "zustand";
import {
	VideoTaskType,
	VideoModel,
	VideoR2vMode,
	VideoResolution,
	VideoRatio,
	VideoAudioSetting,
	VideoRegularizeMode,
	VideoInputPayload,
	VideoGenerationResult,
	VideoFile,
} from "@/types/video-generation.types";
import {
	buildVideoDifyInputs,
	VIDEO_MODEL_CAPABILITIES,
} from "@/lib/video-dify-payload";

const DEFAULT_NEGATIVE_PROMPT =
	"low resolution, error, worst quality, low quality, deformed, extra fingers, bad proportions";

const STORAGE_KEY_LAST_VIDEO = "video_gen_last_video_url";
const STORAGE_KEY_CONVERSATION = "conversation_id";
const STORAGE_KEY_CATEGORY = "conversation_category";
const VIDEO_CATEGORY = "VIDEO_GEN_EDIT_KEY";

interface VideoSettingsStore {
	// Generation settings
	taskType: VideoTaskType;
	model: VideoModel;
	r2vMode: VideoR2vMode;
	r2vHasFirstFrame: boolean;
	negativePrompt: string;
	resolution: VideoResolution;
	ratio: VideoRatio;
	duration: number;
	audioSetting: VideoAudioSetting;
	seed: number;
	useContinuation: boolean;
	regularizeMode: VideoRegularizeMode;
	testQuery: string;

	// Runtime state
	lastVideoUrl: string | null;
	canContinue: boolean;
	generationProgress: string | null;
	lastResult: VideoGenerationResult | null;

	// Setters
	setTaskType: (type: VideoTaskType) => void;
	setModel: (model: VideoModel) => void;
	setR2vMode: (mode: VideoR2vMode) => void;
	setR2vHasFirstFrame: (v: boolean) => void;
	setNegativePrompt: (v: string) => void;
	setResolution: (v: VideoResolution) => void;
	setRatio: (v: VideoRatio) => void;
	setDuration: (v: number) => void;
	setAudioSetting: (v: VideoAudioSetting) => void;
	setSeed: (v: number) => void;
	setUseContinuation: (v: boolean) => void;
	setRegularizeMode: (v: VideoRegularizeMode) => void;
	setProgress: (progress: string | null) => void;

	// Actions
	handleGenerationResult: (result: VideoGenerationResult) => void;
	resetConversation: () => void;

	// Payload builder
	getPayload: (uploadedFiles?: readonly VideoFile[]) => VideoInputPayload;
}

function readLastVideoUrl(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(STORAGE_KEY_LAST_VIDEO);
}

export const useVideoSettingsStore = create<VideoSettingsStore>((set, get) => ({
	taskType: "T2V",
	model: "wan",
	r2vMode: "NONE",
	r2vHasFirstFrame: false,
	negativePrompt: DEFAULT_NEGATIVE_PROMPT,
	resolution: "720P",
	ratio: "16:9",
	duration: 5,
	audioSetting: "auto",
	seed: -1,
	useContinuation: false,
	regularizeMode: "crop",
	testQuery: "",

	lastVideoUrl: readLastVideoUrl(),
	canContinue: !!readLastVideoUrl(),
	generationProgress: null,
	lastResult: null,

	setTaskType: (type) => {
		// Continuation only valid for I2V and KF2V
		const continuationAllowed = type === "I2V" || type === "KF2V";
		set({
			taskType: type,
			r2vMode: type === "R2V" ? "STORYBOARD" : "NONE",
			r2vHasFirstFrame: type === "R2V" ? get().r2vHasFirstFrame : false,
			useContinuation: continuationAllowed ? get().useContinuation : false,
		});
	},

	setModel: (model) => {
		const capabilities = VIDEO_MODEL_CAPABILITIES[model];
		set((state) => ({
			model,
			duration: Math.max(
				capabilities.minDuration,
				Math.min(capabilities.maxDuration, state.duration),
			),
			r2vHasFirstFrame: capabilities.r2vFirstFrame
				? state.r2vHasFirstFrame
				: false,
		}));
	},
	setR2vMode: (mode) => set({ r2vMode: mode }),
	setR2vHasFirstFrame: (v) => set({ r2vHasFirstFrame: v }),
	setNegativePrompt: (v) => set({ negativePrompt: v }),
	setResolution: (v) => set({ resolution: v }),
	setRatio: (v) => set({ ratio: v }),
	setDuration: (v) => set({ duration: Math.max(2, Math.min(15, Math.floor(v))) }),
	setAudioSetting: (v) => set({ audioSetting: v }),
	setSeed: (v) =>
		set({
			seed: Number.isFinite(v)
				? Math.max(-1, Math.min(2147483647, Math.trunc(v)))
				: -1,
		}),
	setUseContinuation: (v) => set({ useContinuation: v }),
	setRegularizeMode: (v) => set({ regularizeMode: v }),
	setProgress: (progress) => set({ generationProgress: progress }),

	handleGenerationResult: (result) => {
		set({ lastResult: result, generationProgress: null });
		if (result.status === "success" && result.video_url) {
			if (typeof window !== "undefined") {
				localStorage.setItem(STORAGE_KEY_LAST_VIDEO, result.video_url);
			}
			set({ lastVideoUrl: result.video_url, canContinue: true });
		}
	},

	resetConversation: () => {
		if (typeof window !== "undefined") {
			localStorage.removeItem(STORAGE_KEY_LAST_VIDEO);
			// Clear video conversation from session if active
			const storedCategory = sessionStorage.getItem(STORAGE_KEY_CATEGORY);
			if (storedCategory === VIDEO_CATEGORY) {
				sessionStorage.removeItem(STORAGE_KEY_CONVERSATION);
				sessionStorage.removeItem(STORAGE_KEY_CATEGORY);
			}
		}
		set({
			lastVideoUrl: null,
			canContinue: false,
			useContinuation: false,
			lastResult: null,
			generationProgress: null,
		});
	},

	getPayload: (uploadedFiles = []): VideoInputPayload => {
		const s = get();
		return buildVideoDifyInputs(s, uploadedFiles);
	},
}));
