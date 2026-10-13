import { IMessage } from "@/interface/IMessage";

// src/lib/llm/types.ts
export type ProviderId = "dify" | "openrouter" | "builtchat";

export enum ChatType {
	CHAT = "chat",
	IMAGE = "image",
	COMPLIANCE_GENERAL = "compliance_general",
	COMPLIANCE_SG = "compliance_sg",
	OUR_PROJECTS = "projects",
	CORENET_X = "corenetx",
	CORPORATE_SERVICES = "corporate",
}

export interface ProviderAppConfig {
	id: string; // adapter ID (dify, openrouter, builtchat, v.v.)
	apiKey: string;
}

/**
 * ILLMClient: unified interface for LLM providers.
 * Implementations adapt provider-specific requests/responses to this interface.
 */
export interface ILLMClient {
	sendMessage: (args: { messages: IMessage[] }) => Promise<void>;
}
