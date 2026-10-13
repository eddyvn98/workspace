import { IFile } from "@/interface/IFile";
import { create } from "zustand";

interface FileState {
	files: IFile[];
	uploadFile: (user: string, file: File) => Promise<void>;
	removeFile: (fileId: string) => void;
	clearFiles: () => void;
}

export const useFileStore = create<FileState>((set) => ({
	files: [],
	clearFiles: () => set({ files: [] }),
	// Upload a file and keep a temporary id so the UI can remove it even if upload fails.
	uploadFile: async (user: string, file: File) => {
		// Generate a stable temporary id for the file
		const tempId = `temp-${Date.now()}-${Math.random()
			.toString(36)
			.slice(2, 9)}`;

		const tempFile: IFile = {
			id: null,
			tempId,
			name: file.name,
			size: file.size,
			type: file.type,
			status: "uploading",
			source_url: ""
		};

		// Add temp file to state immediately
		set((state) => ({ files: [...state.files, tempFile] }));

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("user", user);

			const res = await fetch("/api/chat/files", {
				method: "POST",
				body: formData,
			});

			if (!res.ok) throw new Error("Upload failed");

			const data = await res.json();
			const serverId: string | null = data.id ?? null;
			// Replace the temp file entry: set server id
			set((state) => ({
				files: state.files.map((f) =>
					f.tempId === tempId
						? { ...f, id: serverId, status: "done", source_url: data.source_url}
						: f,
				),
			}));

		} catch (err) {
			console.error("Upload error:", err);

			// Mark the temp file as error (still identifiable by tempId)
			set((state) => ({
				files: state.files.map((f) =>
					f.tempId === tempId ? { ...f, status: "error" } : f,
				),
			}));
		}
	},

	removeFile: (fileKey: string) =>
		set((state) => ({
			files: state.files.filter(
				(f) => f.id !== fileKey && f.tempId !== fileKey,
			),
		})),
}));
