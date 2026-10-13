/**
 * Pure extraction of usage metadata from Dify responses. Only token counts,
 * latency, identifiers, timestamps, status and model hints are read — every
 * pricing field Dify sends (prompt_price, completion_price, total_price,
 * *_unit_price, *_price_unit, currency) is deliberately ignored.
 */
import type { AIUsageStatus } from "./usage-event.types";

export interface ExtractedUsage {
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	latencySeconds: number | null;
}

/** One Dify message (chat/chatflow) or workflow run, as observed by Workspace. */
export interface DifyCapture {
	messageId: string | null;
	conversationId: string | null;
	workflowRunId: string | null;
	appMode: string | null;
	createdAt: Date | null;
	usage: ExtractedUsage | null;
	status: AIUsageStatus;
	nodeModels: string[];
}

type Obj = Record<string, unknown>;

export function asObject(value: unknown): Obj | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

export function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCount(value: unknown): number | null {
	const n = typeof value === "string" && value.trim() ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function toSeconds(value: unknown): number | null {
	const n = typeof value === "string" && value.trim() ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Dify timestamps are unix seconds. */
export function fromUnixSeconds(value: unknown): Date | null {
	const n = toSeconds(value);
	return n === null ? null : new Date(n * 1000);
}

/**
 * Maps Dify `metadata.usage` (LLMUsage). Returns null when it carries no
 * token numbers at all, so callers never store fabricated zeros.
 */
export function usageFromMetadata(metadata: unknown): ExtractedUsage | null {
	const usage = asObject(asObject(metadata)?.usage);
	if (!usage) return null;
	const inputTokens = toCount(usage.prompt_tokens);
	const outputTokens = toCount(usage.completion_tokens);
	const reportedTotal = toCount(usage.total_tokens);
	const totalTokens =
		reportedTotal ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
	if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
	return { inputTokens, outputTokens, totalTokens, latencySeconds: toSeconds(usage.latency) };
}

/** Workflow runs only expose a total — the input/output split stays null. */
export function usageFromWorkflowData(data: unknown): ExtractedUsage | null {
	const d = asObject(data);
	if (!d) return null;
	const totalTokens = toCount(d.total_tokens);
	const latencySeconds = toSeconds(d.elapsed_time);
	if (totalTokens === null) return null;
	return { inputTokens: null, outputTokens: null, totalTokens, latencySeconds };
}

export function workflowStatus(value: unknown): AIUsageStatus {
	switch (value) {
		case "succeeded":
			return "success";
		case "stopped":
			return "stopped";
		case "partial-succeeded":
			return "partial";
		case "failed":
		case "error":
			return "error";
		default:
			return "partial";
	}
}

/**
 * Blocking JSON from POST /chat-messages, /completion-messages or
 * /workflows/run. Returns null when the payload identifies no message/run.
 */
export function captureFromBlockingResponse(payload: unknown): DifyCapture | null {
	const root = asObject(payload);
	if (!root) return null;
	const data = asObject(root.data);

	// Workflow app: { workflow_run_id, task_id, data: { id, status, total_tokens, elapsed_time, ... } }
	if (data && (asString(root.workflow_run_id) || ("total_tokens" in data && "elapsed_time" in data))) {
		const workflowRunId = asString(root.workflow_run_id) ?? asString(data.id);
		if (!workflowRunId) return null;
		const usage = usageFromWorkflowData(data);
		return {
			messageId: null,
			conversationId: null,
			workflowRunId,
			appMode: "workflow",
			createdAt: fromUnixSeconds(data.created_at),
			usage,
			status: workflowStatus(data.status),
			nodeModels: [],
		};
	}

	// Chat / agent / chatflow / completion: { message_id | id, conversation_id, mode, metadata: { usage }, created_at }
	const messageId = asString(root.message_id) ?? asString(root.id);
	if (!messageId) return null;
	const usage = usageFromMetadata(root.metadata);
	return {
		messageId,
		conversationId: asString(root.conversation_id),
		workflowRunId: asString(root.workflow_run_id),
		appMode: asString(root.mode),
		createdAt: fromUnixSeconds(root.created_at),
		usage,
		status: usage ? "success" : "partial",
		nodeModels: [],
	};
}

/**
 * The model Workspace asked Dify to use, from the request inputs it built. Keys
 * are the ones the current source actually sends: `model_selector` (General
 * Chat, Academy, Workspace, Mindmap, Meeting fallbacks), `model` (Video) and
 * `Models` (Image generator settings).
 */
export function requestedModelFromInputs(inputs: unknown): string | null {
	const obj = asObject(inputs);
	if (!obj) return null;
	for (const key of ["model_selector", "model", "Models"]) {
		const value = asString(obj[key]);
		if (value) return value.slice(0, 120);
	}
	return null;
}

/** Host part of a Dify URL, lower-cased; null when unparseable. */
export function difyHostFromUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return null;
	}
}
