// Categories recorded in Workspace chat history.
export type ChatSessionCategory =
	| "CHAT_KEY"
	| "IMAGE_KEY"
	| "VIDEO_GEN_EDIT_KEY"
	| "COMPLIANCE_KEY"
	| "WORKSPACE_AGENT_CHAT_KEY";

export type ChatSessionRegion = "SG" | null;

export interface ChatSession {
	id: string;
	userId: string;
	category: ChatSessionCategory;
	region: ChatSessionRegion;
	difyConversationId: string;
	title: string;
	pinned: boolean;
	pinnedAt: string | null;
	createdAt: string;
	updatedAt: string;
	workspaceMessages?: unknown[];
	workspaceBoardId?: string;
}

export interface ChatSessionListItem
	extends Pick<
		ChatSession,
		| "id"
		| "title"
		| "category"
		| "region"
		| "updatedAt"
		| "pinned"
		| "difyConversationId"
	> {}
