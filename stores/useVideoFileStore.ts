import { create } from "zustand";
import {
	VideoFile,
	VideoFileType,
	VIDEO_ACCEPTED_EXTENSIONS,
	VIDEO_SIZE_LIMITS,
} from "@/types/video-generation.types";

interface VideoFileStore {
	// Ordered list: images first (for KF2V ordering), then videos; determines file positions sent to Dify
	uploadedFiles: VideoFile[];
	audioFile: VideoFile | null;
	uploadError: string | null;

	uploadFile: (file: File, user: string) => Promise<void>;
	removeFile: (id: string) => void;
	removeAudioFile: () => void;
	moveFile: (fromIdx: number, toIdx: number) => void;
	clearAll: () => void;
	setUploadError: (error: string | null) => void;
}

function detectFileType(file: File): VideoFileType | null {
	const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
	if (VIDEO_ACCEPTED_EXTENSIONS.image.includes(ext)) return "image";
	if (VIDEO_ACCEPTED_EXTENSIONS.video.includes(ext)) return "video";
	if (VIDEO_ACCEPTED_EXTENSIONS.audio.includes(ext)) return "audio";
	return null;
}

function generateId(): string {
	return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useVideoFileStore = create<VideoFileStore>((set, get) => ({
	uploadedFiles: [],
	audioFile: null,
	uploadError: null,

	setUploadError: (error) => set({ uploadError: error }),

	uploadFile: async (file: File, user: string) => {
		const fileType = detectFileType(file);
		if (!fileType) {
			set({ uploadError: `"${file.name}" is not a supported file type.` });
			return;
		}

		const sizeLimit = VIDEO_SIZE_LIMITS[fileType];
		if (file.size > sizeLimit) {
			const limitMb = Math.round(sizeLimit / 1024 / 1024);
			set({
				uploadError: `"${file.name}" exceeds the ${limitMb} MB limit for ${fileType} files.`,
			});
			return;
		}

		const id = generateId();
		const previewUrl = URL.createObjectURL(file);

		const newFile: VideoFile = {
			id,
			name: file.name,
			fileType,
			mimeType: file.type,
			size: file.size,
			status: "uploading",
			uploadFileId: null,
			previewUrl,
		};

		if (fileType === "audio") {
			// Revoke previous audio preview if any
			const prev = get().audioFile;
			if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
			set({ audioFile: newFile, uploadError: null });
		} else {
			set((state) => ({
				uploadedFiles: [...state.uploadedFiles, newFile],
				uploadError: null,
			}));
		}

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("user", user);

			const res = await fetch("/api/video/files", {
				method: "POST",
				body: formData,
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Upload failed");

			const uploadFileId = data.id as string;

			if (!uploadFileId) {
				throw new Error("Upload succeeded but Dify returned no file ID. Please retry.");
			}

			if (fileType === "audio") {
				set((state) => {
					if (state.audioFile?.id !== id) return state;
					return {
						audioFile: { ...state.audioFile, status: "done", uploadFileId },
					};
				});
			} else {
				set((state) => ({
					uploadedFiles: state.uploadedFiles.map((f) =>
						f.id === id ? { ...f, status: "done", uploadFileId } : f,
					),
				}));
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Upload failed. Please retry.";

			if (fileType === "audio") {
				set((state) => {
					if (state.audioFile?.id !== id) return state;
					return {
						audioFile: { ...state.audioFile, status: "error" },
						uploadError: message,
					};
				});
			} else {
				set((state) => ({
					uploadedFiles: state.uploadedFiles.map((f) =>
						f.id === id ? { ...f, status: "error" } : f,
					),
					uploadError: message,
				}));
			}
		}
	},

	removeFile: (id: string) => {
		set((state) => {
			const removed = state.uploadedFiles.find((f) => f.id === id);
			if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
			return {
				uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
				uploadError: null,
			};
		});
	},

	removeAudioFile: () => {
		set((state) => {
			if (state.audioFile?.previewUrl)
				URL.revokeObjectURL(state.audioFile.previewUrl);
			return { audioFile: null };
		});
	},

	moveFile: (fromIdx: number, toIdx: number) => {
		set((state) => {
			const files = [...state.uploadedFiles];
			if (fromIdx < 0 || toIdx < 0 || fromIdx >= files.length || toIdx >= files.length)
				return state;
			const [moved] = files.splice(fromIdx, 1);
			files.splice(toIdx, 0, moved);
			return { uploadedFiles: files };
		});
	},

	clearAll: () => {
		// Do NOT revoke previewUrls here — after sendMessage() they are stored in
		// userMessage.images in the message store and must remain valid for rendering.
		// Individual removeFile() still revokes the URL for files removed before send.
		set({ uploadedFiles: [], audioFile: null, uploadError: null });
	},
}));
