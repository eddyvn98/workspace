/**
 * Side-channel observer for a Dify response that Workspace is already forwarding.
 *
 * The proxy keeps piping the original bytes to the browser untouched; it only
 * hands each chunk (or each event it already parsed) to this observer as
 * well. The observer never mutates, delays or re-orders anything, keeps at
 * most one partial SSE line in memory (a whole body only for blocking JSON,
 * bounded), and swallows its own errors — a bug here can only lose a usage
 * event, never break the chat stream.
 */
import {
	asObject,
	asString,
	captureFromBlockingResponse,
	fromUnixSeconds,
	usageFromMetadata,
	usageFromWorkflowData,
	workflowStatus,
	type DifyCapture,
	type ExtractedUsage,
} from "./dify-usage-extract";
import type { AIUsageStatus } from "./usage-event.types";

export type StreamEndReason = "complete" | "aborted" | "error";

export interface DifyStreamObserver {
	/** Raw upstream bytes, exactly as forwarded. */
	onBytes(chunk: Uint8Array): void;
	/** An SSE `data:` payload the caller already parsed. */
	onEvent(event: Record<string, unknown>): void;
	/** Idempotent; emits at most one capture. */
	finish(reason: StreamEndReason): void;
}

/** Blocking bodies above this size are not buffered for usage extraction. */
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

export function createDifyStreamObserver(options: {
	contentType: string | null;
	onCapture: (capture: DifyCapture) => void;
}): DifyStreamObserver {
	const isJson = (options.contentType ?? "").toLowerCase().includes("application/json");
	const decoder = new TextDecoder("utf-8");
	let disabled = false;
	let finished = false;

	// SSE state. The still-unterminated line is kept as the decoded pieces it
	// arrived in, and only newly decoded text is ever searched for a newline:
	// re-splitting the whole partial line on every chunk made one long `data:`
	// line (a large node_finished/workflow_finished payload) cost O(n²) and
	// starved the event loop.
	let pendingLine: string[] = [];
	let messageId: string | null = null;
	let conversationId: string | null = null;
	let workflowRunId: string | null = null;
	let createdAt: Date | null = null;
	let sawWorkflowEvents = false;
	let sawAgentEvents = false;
	let sawError = false;
	let terminalUsage: ExtractedUsage | null = null;
	let terminalStatus: AIUsageStatus | null = null;
	let sawMessageEnd = false;
	const nodeModels = new Set<string>();

	// Blocking JSON state
	let jsonText = "";
	let jsonTooLarge = false;

	const guard = (fn: () => void) => {
		if (disabled || finished) return;
		try {
			fn();
		} catch {
			disabled = true;
		}
	};

	const handleEvent = (event: Record<string, unknown>) => {
		const name = typeof event.event === "string" ? event.event : "";
		messageId = asString(event.message_id) ?? messageId;
		conversationId = asString(event.conversation_id) ?? conversationId;
		workflowRunId = asString(event.workflow_run_id) ?? workflowRunId;

		switch (name) {
			case "workflow_started":
				sawWorkflowEvents = true;
				workflowRunId = asString(asObject(event.data)?.id) ?? workflowRunId;
				break;
			case "agent_message":
			case "agent_thought":
				sawAgentEvents = true;
				break;
			case "node_finished": {
				const data = asObject(event.data);
				if (data?.node_type === "llm") {
					const model = asString(asObject(data.process_data)?.model_name);
					if (model) nodeModels.add(model.slice(0, 120));
				}
				break;
			}
			case "message_end":
				sawMessageEnd = true;
				messageId = asString(event.message_id) ?? asString(event.id) ?? messageId;
				createdAt = fromUnixSeconds(event.created_at) ?? createdAt;
				terminalUsage = usageFromMetadata(event.metadata);
				terminalStatus = "success";
				break;
			case "workflow_finished": {
				sawWorkflowEvents = true;
				const data = asObject(event.data);
				workflowRunId = asString(data?.id) ?? workflowRunId;
				createdAt = createdAt ?? fromUnixSeconds(data?.created_at);
				// Chatflow: message_end carries the real usage; the run total is
				// only a fallback for plain workflow apps.
				if (!sawMessageEnd) {
					terminalUsage = usageFromWorkflowData(data);
					terminalStatus = workflowStatus(data?.status);
				}
				break;
			}
			case "error":
				sawError = true;
				break;
		}
	};

	const handleLine = (rawLine: string) => {
		const line = rawLine.trim();
		if (!line.startsWith("data:")) return;
		const payload = line.slice(5).trim();
		if (!payload || payload === "[DONE]") return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(payload);
		} catch {
			return;
		}
		const event = asObject(parsed);
		if (event) handleEvent(event);
	};

	/** Hands every line completed by `text` to handleLine exactly once. Splits
	 *  on "\n" only; a CRLF line's trailing "\r" is removed by handleLine's
	 *  trim, matching the previous /\r?\n/ split. */
	const consumeText = (text: string) => {
		let start = 0;
		let newline = text.indexOf("\n");
		while (newline !== -1) {
			const tail = text.slice(start, newline);
			if (pendingLine.length > 0) {
				pendingLine.push(tail);
				const line = pendingLine.join("");
				pendingLine = [];
				handleLine(line);
			} else {
				handleLine(tail);
			}
			start = newline + 1;
			newline = text.indexOf("\n", start);
		}
		if (start < text.length) pendingLine.push(text.slice(start));
	};

	const buildStreamCapture = (reason: StreamEndReason): DifyCapture | null => {
		if (!messageId && !workflowRunId) return null;
		let status: AIUsageStatus;
		let usage: ExtractedUsage | null = null;
		if (terminalStatus) {
			status = terminalStatus;
			usage = terminalUsage;
		} else if (sawError || reason === "error") {
			status = "error";
		} else if (reason === "aborted") {
			status = "stopped";
		} else {
			status = "partial";
		}
		const appMode = sawWorkflowEvents
			? messageId || conversationId
				? "advanced-chat"
				: "workflow"
			: sawAgentEvents
				? "agent-chat"
				: null;
		return {
			messageId,
			conversationId,
			workflowRunId,
			appMode,
			createdAt,
			usage,
			status,
			nodeModels: [...nodeModels],
		};
	};

	return {
		onBytes(chunk) {
			guard(() => {
				if (isJson) {
					if (jsonTooLarge) return;
					jsonText += decoder.decode(chunk, { stream: true });
					if (jsonText.length > MAX_JSON_BODY_BYTES) {
						jsonTooLarge = true;
						jsonText = "";
					}
					return;
				}
				consumeText(decoder.decode(chunk, { stream: true }));
			});
		},
		onEvent(event) {
			guard(() => handleEvent(event));
		},
		finish(reason) {
			if (finished) return;
			let capture: DifyCapture | null = null;
			if (!disabled) {
				try {
					if (isJson) {
						jsonText += decoder.decode();
						if (!jsonTooLarge && jsonText.trim() && reason === "complete") {
							capture = captureFromBlockingResponse(JSON.parse(jsonText));
						}
					} else {
						pendingLine.push(decoder.decode());
						const lastLine = pendingLine.join("");
						pendingLine = [];
						if (lastLine.trim()) handleLine(lastLine);
						capture = buildStreamCapture(reason);
					}
				} catch {
					capture = null;
				}
			}
			finished = true;
			jsonText = "";
			pendingLine = [];
			if (capture) {
				try {
					options.onCapture(capture);
				} catch {
					// Recording failures never surface to the stream.
				}
			}
		},
	};
}
