export type ImageFlowOutputRole = "main" | "reference";

export interface ImageFlowImageOrigin {
	flowId: string;
	generateBlockId: string;
	runId: string;
	outputIndex: number;
	role: ImageFlowOutputRole;
}

export interface WorkspaceImageData {
	url: string;
	/** Links an image block to the canonical uploaded WorkspaceResource when
	 *  the same file is also indexed for chat/knowledge. */
	resourceId?: string;
	alt?: string;
	fit?: "cover" | "contain";
	extraUrls?: string[];
	activeIndex?: number;
	downloadUrl?: string;
	imageFlowOrigin?: ImageFlowImageOrigin;
}
