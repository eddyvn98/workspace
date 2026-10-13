let selectedAIModelName = "Gemini 3.7 Flash";

export function getSelectedAIModelName(): string {
	return selectedAIModelName;
}

export function rememberSelectedAIModelName(name: string): void {
	selectedAIModelName = name;
}
