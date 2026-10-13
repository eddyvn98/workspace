import type { ImagePayloadInputs } from "@/types/image-generation.types";

export interface IMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
	isLoading?: boolean;
	error?: boolean;
	files?: { name: string; url: string }[];
	images?: string[];
	videos?: string[];
	audios?: string[];
	isThinkingFinished?: boolean;
	thought?: string;
	/** Snapshot of all generation settings at send time (IMAGE_KEY only). */
	generationParams?: ImagePayloadInputs;
	/** Name of the view this message belongs to (View Creator multi-view batch). */
	viewLabel?: string;
	/** Groups messages generated together in one multi-view batch send. */
	batchId?: string;
}

export interface Conversation {
	id: string;
	name: string;
	created_at: number;
}
