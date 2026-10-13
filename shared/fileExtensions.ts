// Supported document file extensions
export const supportedDocExtensions: string[] = [
	".txt",
	".md",
	".mdx",
	".markdown",
	".pdf",
	".html",
	".xlsx",
	".xls",
	".doc",
	".docx",
	".csv",
	".eml",
	".msg",
	".pptx",
	".ppt",
	".xml",
	".epub",
];

// Supported image file extensions
export const supportedImageExtensions: string[] = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
];

// Supported audio file extensions
export const supportedAudioExtensions: string[] = [
	".mp3",
	".m4a",
	".wav",
	".amr",
	".mpga",
];

// Supported video file extensions
export const supportedVideoExtensions: string[] = [
	".mp4",
	".mov",
	".mpeg",
	".webm",
];

export const FILE_EXTENSIONS = {
	DOCUMENTS: supportedDocExtensions,
	IMAGES: supportedImageExtensions,
	AUDIO: supportedAudioExtensions,
	VIDEO: supportedVideoExtensions,
} as const;
