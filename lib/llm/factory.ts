// src/lib/llm/factory.ts

import { resolveCategoryProvider } from "@/app/config/categoryProviderResolver";
import { createDifyClient } from "./adapters/difyAdapter";

export function createClientFromCategory(
	category: string,
	prompt: string,
	inputs: Record<string, any>,
	user: string,
	selectedCountry?: string,
) {
	const { id } = resolveCategoryProvider(
		category,
		selectedCountry,
	);

	switch (id) {
		case "dify":
			return createDifyClient(category, prompt, inputs, user);
		case "builtchat":
			//return createBuiltChatClient(prompt);
		case "openrouter":
			//return new OpenRouterClient(apiKey);
		default:
			throw new Error(`Unknown provider id: ${id}`);
	}
}
