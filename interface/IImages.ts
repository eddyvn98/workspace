export interface IImage {
	id: string;
	name: string;
	status: "uploading" | "done" | "error";
	url: string;
	/** When true, this image is used only for the outgoing request and must not be shown in the upload zone UI. */
	hidden?: boolean;
}