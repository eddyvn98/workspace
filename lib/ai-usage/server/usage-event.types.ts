/**
 * Persisted shape of one AI usage event (collection `workspace_ai.ai_usage_events`).
 *
 * Usage analytics only: no prompt/answer text, no file or knowledge content,
 * and no billing data (price, unit price, currency, cost) — Dify returns
 * pricing in `metadata.usage` but it is never read, stored or returned.
 */

/** Explicit so other platforms (Claude, Gemini, ChatGPT) can share the model later. */
export type AIUsagePlatform = "Workspace";

export type AIUsageStatus = "success" | "stopped" | "error" | "partial";

export type AIUsageSource = "realtime" | "backfill";

/** Where `model` came from. "requested" = the model Workspace asked Dify to use. */
export type AIUsageModelSource = "requested" | "dify-node";

export interface AIUsageEventDoc {
	/** Deterministic dedupe key — see buildUsageEventKey(). */
	_id: string;
	platform: AIUsagePlatform;

	/** Email as Workspace identified the user (server-side identity). */
	email: string;
	/** Lower-cased/trimmed email — the reporting identity. */
	normalizedEmail: string;
	/** Exact `user` string sent to Dify (needed to query Dify history). */
	difyUser: string;

	departmentId: string | null;
	departmentName: string | null;
	departmentIds: string[];

	/** Workspace category/app identity as it exists in source (x-category key or app key env name). */
	category: string;
	/** Call site within Workspace (e.g. "chat-proxy", "meeting:ask"). */
	feature: string | null;
	/** Consumed-stream/provider wall time; distinct from Dify-reported model latency. */
	observedDurationMs?: number;
	/** Runtime correlation only; legacy events have no turn ID. */
	workspaceTurnId?: string;
	/** Dify app mode when Dify reports it or the event stream proves it. */
	appMode: string | null;
	difyHost: string | null;

	conversationId: string | null;
	messageId: string | null;
	workflowRunId: string | null;

	model: string | null;
	modelSource: AIUsageModelSource | null;
	/** Distinct LLM model names seen in Dify node_finished events, if any. */
	difyNodeModels: string[];

	/** null = Dify did not provide the number (never fabricated). */
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	latencySeconds: number | null;
	/** false when Dify gave no token usage for this event. */
	usageAvailable: boolean;

	status: AIUsageStatus;
	source: AIUsageSource;

	/** When the Dify message/run happened (Dify timestamp when available). */
	createdAt: Date;
	/** When Workspace persisted the event. */
	capturedAt: Date;
	/** Set when a later backfill filled tokens into an event that had none. */
	enrichedAt?: Date;
}
