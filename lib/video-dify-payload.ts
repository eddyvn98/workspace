import type {
	VideoAudioSetting,
	VideoFile,
	VideoInputPayload,
	VideoModel,
	VideoR2vMode,
	VideoRatio,
	VideoRegularizeMode,
	VideoResolution,
	VideoTaskType,
} from "@/types/video-generation.types";

export interface VideoSettingsSnapshot {
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
	testQuery?: string;
}

interface VideoModelCapabilities {
	minDuration: number;
	maxDuration: number;
	ratioUnsupportedFor: readonly VideoTaskType[];
	r2vFirstFrame: boolean;
}

/**
 * Keep model-specific normalization in one place. The Dify workflow remains
 * responsible for routing task types to the concrete model endpoint.
 */
export const VIDEO_MODEL_CAPABILITIES: Record<
	VideoModel,
	VideoModelCapabilities
> = {
	wan: {
		minDuration: 2,
		maxDuration: 15,
		ratioUnsupportedFor: [],
		r2vFirstFrame: true,
	},
	happyhorse: {
		minDuration: 3,
		maxDuration: 15,
		// HappyHorse image-to-video derives its ratio from the first frame.
		ratioUnsupportedFor: ["I2V"],
		r2vFirstFrame: false,
	},
};

export interface DifyVideoFile {
	type: VideoFile["fileType"];
	transfer_method: "local_file";
	upload_file_id: string;
	url: "";
}

function normalizeInteger(
	value: number,
	fallback: number,
	min?: number,
	max?: number,
): number {
	const integer = Number.isFinite(value) ? Math.trunc(value) : fallback;
	return Math.max(min ?? integer, Math.min(max ?? integer, integer));
}

function hasValidFirstFrame(files: readonly VideoFile[]): boolean {
	return files.some(
		(file) =>
			file.fileType === "image" &&
			file.status === "done" &&
			typeof file.uploadFileId === "string" &&
			file.uploadFileId.length > 0,
	);
}

export function buildVideoDifyInputs(
	settings: VideoSettingsSnapshot,
	uploadedFiles: readonly VideoFile[],
): VideoInputPayload {
	const capabilities = VIDEO_MODEL_CAPABILITIES[settings.model];
	const duration = normalizeInteger(
		settings.duration,
		5,
		capabilities.minDuration,
		capabilities.maxDuration,
	);
	const seed = normalizeInteger(settings.seed, -1);
	const isMultiEntityR2v =
		settings.taskType === "R2V" && settings.r2vMode === "MULTI_ENTITY";

	const inputs: VideoInputPayload = {
		task_type: settings.taskType,
		model: settings.model,
		r2v_mode:
			settings.taskType === "R2V" ? settings.r2vMode : "NONE",
		r2v_has_first_frame:
			capabilities.r2vFirstFrame &&
			isMultiEntityR2v &&
			settings.r2vHasFirstFrame &&
			hasValidFirstFrame(uploadedFiles)
				? "true"
				: "false",
		negative_prompt: settings.negativePrompt ?? "",
		resolution: settings.resolution,
		ratio: settings.ratio,
		duration,
		audio_setting:
			settings.taskType === "VIDEO_EDIT" ? settings.audioSetting : "auto",
		seed,
		use_last_video_frame:
			(settings.taskType === "I2V" || settings.taskType === "KF2V") &&
			settings.useContinuation
				? "true"
				: "false",
		regularize_mode: settings.regularizeMode,
		test_query: settings.testQuery ?? "",
	};

	if (capabilities.ratioUnsupportedFor.includes(settings.taskType)) {
		delete inputs.ratio;
	}

	return inputs;
}

export function buildDifyVideoFiles(
	uploadedFiles: readonly VideoFile[],
	audioFile: VideoFile | null,
): DifyVideoFile[] {
	return [...uploadedFiles, ...(audioFile ? [audioFile] : [])]
		.filter(
			(file): file is VideoFile & { uploadFileId: string } =>
				file.status === "done" &&
				typeof file.uploadFileId === "string" &&
				file.uploadFileId.length > 0,
		)
		.map((file) => ({
			type: file.fileType,
			transfer_method: "local_file",
			upload_file_id: file.uploadFileId,
			url: "",
		}));
}

interface BuildVideoDifyRequestOptions {
	inputs: VideoInputPayload;
	query: string;
	user: string;
	files: DifyVideoFile[];
	conversationId?: string | null;
}

export function buildVideoDifyRequestBody({
	inputs,
	query,
	user,
	files,
	conversationId,
}: BuildVideoDifyRequestOptions) {
	return {
		inputs,
		query,
		response_mode: "streaming" as const,
		...(inputs.task_type === "VIDEO_EDIT"
			? { conversation_id: "" }
			: conversationId
				? { conversation_id: conversationId }
				: {}),
		user,
		files,
	};
}
