export type VideoTaskType = "T2V" | "I2V" | "KF2V" | "R2V" | "VIDEO_EDIT";
export type VideoModel = "wan" | "happyhorse";
export type VideoR2vMode = "NONE" | "STORYBOARD" | "MULTI_ENTITY";
export type VideoResolution = "720P" | "1080P";
export type VideoRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
export type VideoAudioSetting = "auto" | "origin";
export type VideoRegularizeMode = "crop" | "pad";
export type VideoFileType = "image" | "video" | "audio";
export type VideoFileStatus = "uploading" | "done" | "error";

export interface VideoFile {
	id: string;
	name: string;
	fileType: VideoFileType;
	mimeType: string;
	size: number;
	status: VideoFileStatus;
	uploadFileId: string | null;
	previewUrl?: string;
}

export interface VideoInputPayload {
	task_type: VideoTaskType;
	model: VideoModel;
	r2v_mode: VideoR2vMode;
	r2v_has_first_frame: "true" | "false";
	negative_prompt: string;
	resolution: VideoResolution;
	ratio?: VideoRatio;
	duration: number;
	audio_setting: VideoAudioSetting;
	seed: number;
	use_last_video_frame: "true" | "false";
	regularize_mode: VideoRegularizeMode;
	test_query: string;
}

export interface VideoSuccessResult {
	status: "success";
	video_url: string;
	task_id: string;
	cost_estimate_usd: number;
	billable_duration: number;
	error_code: null;
	error_message: null;
}

export interface VideoErrorResult {
	status: "error";
	video_url: null;
	task_id: string;
	error_code: string;
	error_message: string;
}

export interface VideoPartialResult {
	status: "partial";
	video_url: null;
	temporary_url: string;
	task_id: string;
	error_code: "SAVE_TO_OSS_FAILED";
	error_message: string;
}

export type VideoGenerationResult =
	| VideoSuccessResult
	| VideoErrorResult
	| VideoPartialResult;

export const VIDEO_NODE_PROGRESS: Record<string, string> = {
	"User Input": "Reading inputs...",
	"Slot Dispatcher": "Validating files...",
	"Handle Continuation": "Preparing continuation...",
	"Extract Last Frame": "Extracting last frame from previous video...",
	"Regularize First Frame": "Normalizing first frame...",
	"Regularize Last Frame": "Normalizing last frame...",
	"Regularize Storyboard": "Normalizing storyboard...",
	"Pre-upload Input Video": "Uploading input video to OSS...",
	"Branch Router": "Routing to model...",
	"Poll DashScope Task": "Generating video — checking status...",
	"Build Save Payload": "Preparing to archive...",
	"Save to OSS": "Archiving video to OSS...",
	"Update Last Video URL": "Updating session...",
};

export const VIDEO_ACCEPTED_EXTENSIONS: Record<VideoFileType, string[]> = {
	image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
	video: [".mp4", ".mov", ".webm", ".mpeg"],
	audio: [".mp3", ".m4a", ".wav", ".amr"],
};

export const VIDEO_SIZE_LIMITS: Record<VideoFileType, number> = {
	image: 20 * 1024 * 1024,
	video: 100 * 1024 * 1024,
	audio: 50 * 1024 * 1024,
};

export const TASK_TYPE_LABELS: Record<VideoTaskType, string> = {
	T2V: "Text to Video",
	I2V: "Image to Video",
	KF2V: "Keyframe to Video",
	R2V: "Reference to Video",
	VIDEO_EDIT: "Video Edit",
};

export const TASK_TYPE_DESCRIPTIONS: Record<VideoTaskType, string> = {
	T2V: "Generate a video from a text prompt only.",
	I2V: "Animate a single image into a video.",
	KF2V: "Morph between two keyframe images.",
	R2V: "Generate from reference images / videos.",
	VIDEO_EDIT: "Edit an existing video with AI.",
};
