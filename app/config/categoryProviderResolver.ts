export interface CategoryProviderConfig {
	id: string;
	apiKey: string;
}

/**
 * Resolve provider config dynamically depending on country and category.
 */
export function resolveCategoryProvider(
	category: string,
	_selectedCountry?: string,
): CategoryProviderConfig {
	switch (category) {
		case "CHAT_KEY":
			return {
				id: "dify",
				apiKey: process.env.CHAT_KEY!,
			};
		case "IMAGE_KEY":
			return {
				id: "dify",
				apiKey: process.env.IMAGE_KEY!,
			};
		case "VIDEO_GEN_EDIT_KEY":
			return {
				id: "dify",
				apiKey: process.env.VIDEO_GEN_EDIT_KEY!,
			};
		case "WORKSPACE_AGENT_CHAT_KEY":
			return {
				id: "dify",
				apiKey: process.env.WORKSPACE_AGENT_DIFY_API_KEY!,
			};
		default:
			return {
				id: "dify",
				apiKey: process.env.CHAT_KEY!,
			};
	}
}
