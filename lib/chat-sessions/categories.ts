import type { ChatSessionCategory } from "@/types/chat-sessions.types";

// Categories that participate in Workspace chat history.
export const CHAT_SESSION_TRACKED_CATEGORIES: readonly ChatSessionCategory[] = [
	"CHAT_KEY",
	"IMAGE_KEY",
	"VIDEO_GEN_EDIT_KEY",
	"WORKSPACE_AGENT_CHAT_KEY",
];

export function isTrackedChatSessionCategory(value: unknown): value is ChatSessionCategory {
	return (
		typeof value === "string" &&
		(CHAT_SESSION_TRACKED_CATEGORIES as readonly string[]).includes(value)
	);
}
