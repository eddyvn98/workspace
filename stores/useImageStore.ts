// store/useImageStore.ts
import { IImage } from "@/interface/IImages";
import { MAX_IMAGE_INPUTS } from "@/types/image-generation.types";
import { create } from "zustand";

interface ImageStore {
	images: IImage[];
	uploadImages: (selectedImages: FileList, maxImages?: number) => Promise<void>;
	deleteImage: (id: string, fileName: string) => Promise<void>;
	clearImages: () => void;
	addExternalImage: (url: string, name: string, hidden?: boolean) => void;
}

export const useImageStore = create<ImageStore>((set, get) => ({
	images: [],

	clearImages: () => set({ images: [] }),

	addExternalImage: (url, name, hidden) =>
		set((state) => {
			if (state.images.length >= MAX_IMAGE_INPUTS) return state;
			return {
				images: [
					...state.images,
					{ id: `ext-${Date.now()}`, name, status: "done" as const, url, ...(hidden ? { hidden: true } : {}) },
				],
			};
		}),

	// Upload multiple images
	uploadImages: async (selectedImages: FileList, maxImages = MAX_IMAGE_INPUTS) => {
		const allImages = Array.from(selectedImages);
		const limit = Math.min(maxImages, MAX_IMAGE_INPUTS);
		const remaining = limit - get().images.length;

		if (remaining <= 0) return;

		const images = allImages.slice(0, remaining);

		for (const image of images) {
			if (get().images.length >= limit) break;

			const tmpId = `${image.name}-${Date.now()}`;

			// Add Image to state as uploading
			set((state) => ({
				images: [
					...state.images,
					{
						id: tmpId,
						name: image.name,
						status: "uploading",
						url: "",
					},
				],
			}));

			try {
				// ❌ File not found → Step 2: upload new file
				const formData = new FormData();
				formData.append("Image", image);

				const uploadRes = await fetch("/api/oss", {
					method: "POST",
					body: formData,
				});

				const uploadData = await uploadRes.json();

				if (uploadRes.ok && uploadData.url) {
					// ✅ Uploaded successfully
					set((state) => ({
						images: state.images.map((f) =>
							f.id === tmpId
								? {
										...f,
										status: "done",
										url: uploadData.url,
								  }
								: f,
						),
					}));
				} else {
					// ❌ Upload failed
					set((state) => ({
						images: state.images.map((f) =>
							f.id === tmpId ? { ...f, status: "error" } : f,
						),
					}));
				}
			} catch (err) {
				// ❌ Unexpected error
				set((state) => ({
					images: state.images.map((f) =>
						f.id === tmpId ? { ...f, status: "error" } : f,
					),
				}));
			}
		}
	},

	// Remove the image from the active prompt first. OSS cleanup is best-effort:
	// a missing OSS configuration must not prevent a user from changing the
	// images they intend to send.
	deleteImage: async (id: string, fileName: string) => {
		// Externally-attached images (History Flow "Attach image", reuse-prompt,
		// branch images, ...) are just URL references — there's no OSS object
		// behind them, so skip the server round-trip and remove locally only.
		if (id.startsWith("ext-")) {
			set((state) => ({
				images: state.images.filter((img) => img.id !== id),
			}));
			return;
		}

		set((state) => ({
			images: state.images.filter((img) => img.id !== id),
		}));

		try {
			const res = await fetch("/api/oss", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fileName }),
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "Failed to delete image");
			}
		} catch (error) {
			console.warn("OSS cleanup failed; image was removed from this prompt:", error);
		}
	},
}));
