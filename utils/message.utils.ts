// Define return type for clarity
export interface IMessageFile {
	name: string;
	url: string;
}

export interface ISplitMessageFilesResult {
	userImages: string[];
	userFiles: IMessageFile[];
	userVideos: string[];
	userAudios: string[];
	aiImages: string[];
	aiFiles: IMessageFile[];
}

/**
 * Splits Dify message_files by ownership (belongs_to) and file type.
 *
 * Returns separate lists so callers can attach files to the correct
 * message bubble without needing to know the Dify schema.
 */
export function splitMessageFilesByOwner(
	messageFiles: any[],
): ISplitMessageFilesResult {
	const userImages: string[] = [];
	const userFiles: IMessageFile[] = [];
	const userVideos: string[] = [];
	const userAudios: string[] = [];
	const aiImages: string[] = [];
	const aiFiles: IMessageFile[] = [];

	for (const file of messageFiles) {
		const isImage =
			file.type === "image" || file.mime_type?.startsWith("image/");
		const isVideo =
			file.type === "video" || file.mime_type?.startsWith("video/");
		const isAudio =
			file.type === "audio" || file.mime_type?.startsWith("audio/");
		const isAssistant = file.belongs_to === "assistant";

		if (isImage) {
			if (file.url) {
				isAssistant
					? aiImages.push(file.url as string)
					: userImages.push(file.url as string);
			}
		} else if (isVideo && !isAssistant && file.url) {
			userVideos.push(file.url as string);
		} else if (isAudio && !isAssistant && file.url) {
			userAudios.push(file.url as string);
		} else {
			const formatted: IMessageFile = {
				name: file.filename ?? file.name ?? "",
				url: file.url ?? "",
			};
			isAssistant ? aiFiles.push(formatted) : userFiles.push(formatted);
		}
	}

	return { userImages, userFiles, userVideos, userAudios, aiImages, aiFiles };
}
