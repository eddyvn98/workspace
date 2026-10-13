export interface IFile {
	id: string | null; // server id, null until server returns
	tempId: string; // local temporary id (always set for new uploads)
	name: string;
	size: number;
	type: string;
	status: "uploading" | "done" | "error";
	source_url: string;
}
