import { resolveWorkspaceAgentEndpoint } from "@/lib/dify/workspace-agent-endpoint";
import { resolveCategoryProvider } from "./categoryProviderResolver";

/**
 * Categories whose chat traffic goes to the self-hosted Dify
 * (NEXT_PUBLIC_AGENT_API_URL); every other category uses Dify Cloud
 * (NEXT_PUBLIC_DIFY_API_URL).
 */
const AGENT_URL_CATEGORIES = new Set([
	"CHAT_KEY",
	"IMAGE_KEY",
	"VIDEO_GEN_EDIT_KEY",
	"WORKSPACE_AGENT_CHAT_KEY",
]);

export interface DifyChatEndpoint {
	apiKey: string | undefined;
	/**
	 * Full /chat-messages URL; undefined when its env var is missing, or (Workspace
	 * Agent outside production) when the configured URL is not a local host.
	 */
	url: string | undefined;
	useAgentUrl: boolean;
}

/**
 * Single source of truth for which Dify app (key) and host a chat category
 * talks to. Used by POST /api/chat/messages (realtime) and by the AI usage
 * backfill, so historical reads always hit the same app realtime used.
 */
export function resolveDifyChatEndpoint(category: string): DifyChatEndpoint {
	const resolvedProvider = resolveCategoryProvider(category);
	const apiKey = category === "WORKSPACE_AGENT_CHAT_KEY"
		? (process.env.WORKSPACE_AGENT_LOCAL_DIFY_API_KEY || resolvedProvider.apiKey)
		: resolvedProvider.apiKey;

	const useAgentUrl = AGENT_URL_CATEGORIES.has(category);

	// Workspace Agent: the shared resolveWorkspaceAgentEndpoint() rule — in
	// production the configured URL (or the hosted fallback); elsewhere only a
	// local-host URL, never a hosted one.
	const url = category === "WORKSPACE_AGENT_CHAT_KEY"
		? (resolveWorkspaceAgentEndpoint({
				configuredUrl: process.env.WORKSPACE_AGENT_LOCAL_DIFY_API_URL || process.env.WORKSPACE_AGENT_DIFY_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL,
				productionFallbackUrl: process.env.WORKSPACE_AGENT_DIFY_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || "",
				isProduction: process.env.NODE_ENV === "production",
			}) ?? undefined)
		: useAgentUrl
			? process.env.NEXT_PUBLIC_AGENT_API_URL
			: process.env.NEXT_PUBLIC_DIFY_API_URL;

	return { apiKey, url, useAgentUrl };
}
