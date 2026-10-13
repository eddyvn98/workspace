import type { CanvasBlock } from "./block";

export type WorkspaceResource = {
	id: string;
	kind: "IMAGE" | "DOCUMENT";
	filename: string;
	mimeType: string;
	createdAt: string;
	updatedAt: string;
	sourceDocumentId: string | null;
	latestVersion: { sizeBytes: string; checksum: string; previewArtifact: { status: "PENDING" | "READY" | "FAILED" | "UNSUPPORTED" } | null };
};

export type LibraryVideo = {
	key: string;
	name: string;
	mimeType: string;
	resourceId?: string;
	createdAt: string | number;
	updatedAt: string | number;
	resource?: WorkspaceResource;
	block?: CanvasBlock<"file">;
};

export type LibraryLink = {
	key: string;
	name: string;
	url: string;
	createdAt: number;
	updatedAt: number;
	block: CanvasBlock<"link">;
};

export type AssetLibraryTab = "images" | "documents" | "videos" | "links";
