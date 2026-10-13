// File: lib/ai-builder/builderChatStream.ts
//
// Shared SSE transport for the AI Builder conversations (Skill Builder and
// Prompt Builder). Both builders talk to the same endpoint as normal chat
// (`POST /api/chat/messages`, which proxies the configured provider), so this
// module owns the request shape, the SSE framing and the answer-delta
// normalisation instead of every builder call site re-implementing them.
//
// Deliberately free of Skill/Prompt business logic: callers keep ownership of
// their generation instruction, their output schema, their JSON parsing and
// their form state.

/** Same route normal chat uses — no second AI endpoint is introduced. */
const BUILDER_CHAT_ENDPOINT = "/api/chat/messages";

/** Builder conversations always run on the general chat app, like before. */
const BUILDER_CHAT_CATEGORY = "CHAT_KEY";

export interface BuilderChatStreamOptions {
	/** The user turn, or the generation instruction, to send upstream. */
	query: string;
	/** Provider conversation to continue. Omit/null to start a fresh one. */
	conversationId?: string | null;
	/** Called for every answer delta, with the delta and the text so far. */
	onToken?: (delta: string, fullText: string) => void;
	/** Called whenever the provider reports the conversation id for this stream. */
	onConversationId?: (conversationId: string) => void;
	signal?: AbortSignal;
}

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortError";
}

/** Picks the answer text out of one SSE event, tolerating the provider's shapes. */
function normalizeAnswerDelta(event: unknown): string {
	if (!event || typeof event !== "object") return "";
	const candidate = event as { answer?: unknown; text?: unknown; data?: unknown };

	if (typeof candidate.answer === "string" && candidate.answer) return candidate.answer;
	if (typeof candidate.text === "string" && candidate.text) return candidate.text;

	if (candidate.data && typeof candidate.data === "object") {
		const nested = (candidate.data as { text?: unknown }).text;
		if (typeof nested === "string" && nested) return nested;
	}

	return "";
}

/** Turns an upstream failure into a single message that is safe to show a user. */
async function describeHttpFailure(response: Response): Promise<string> {
	if (response.status === 401) {
		return "Your session has expired. Please sign in again and retry.";
	}

	let detail = "";
	try {
		const body = await response.text();
		if (body) {
			try {
				const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
				const fromJson = typeof parsed.error === "string" ? parsed.error : parsed.message;
				detail = typeof fromJson === "string" ? fromJson : body;
			} catch {
				detail = body;
			}
		}
	} catch {
		// Body already consumed or unreadable — the status alone has to do.
	}

	detail = detail.trim().slice(0, 200);
	return detail
		? `The AI service returned an error (${response.status}): ${detail}`
		: `The AI service returned an error (${response.status}).`;
}

/**
 * Sends one builder turn and resolves with the full assistant text.
 *
 * Streaming events are delivered through `onToken` as they arrive so callers can
 * render progressively; the resolved value is the same text, fully accumulated.
 * Every failure mode (network, HTTP, empty body, broken stream) surfaces as an
 * `Error` whose message is already user-presentable. `AbortError` is re-thrown
 * untouched so callers can tell cancellation apart from a real failure.
 */
export async function streamBuilderChat(options: BuilderChatStreamOptions): Promise<string> {
	const { query, conversationId, onToken, onConversationId, signal } = options;

	let response: Response;
	try {
		response = await fetch(BUILDER_CHAT_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-category": BUILDER_CHAT_CATEGORY,
			},
			body: JSON.stringify({
				inputs: {},
				query,
				response_mode: "streaming",
				user: "User",
				...(conversationId ? { conversation_id: conversationId } : {}),
			}),
			signal,
		});
	} catch (err) {
		if (isAbortError(err)) throw err;
		throw new Error("Could not reach the AI service. Please check your connection and try again.");
	}

	if (!response.ok) {
		throw new Error(await describeHttpFailure(response));
	}
	if (!response.body) {
		throw new Error("The AI service returned an empty response. Please try again.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let fullText = "";

	// One complete SSE line. A JSON payload never contains a raw newline, so
	// splitting on "\n" already guarantees whole events here — a payload that
	// still fails to parse is malformed (or a provider keep-alive) and is skipped.
	const consumeLine = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) return;

		const payload = trimmed.slice(5).trim();
		if (!payload || payload === "[DONE]") return;

		let event: unknown;
		try {
			event = JSON.parse(payload);
		} catch {
			return;
		}

		const reportedId = (event as { conversation_id?: unknown }).conversation_id;
		if (typeof reportedId === "string" && reportedId) onConversationId?.(reportedId);

		const delta = normalizeAnswerDelta(event);
		if (!delta) return;

		fullText += delta;
		onToken?.(delta, fullText);
	};

	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) consumeLine(line);
		}
		// Flush a final event that arrived without a trailing newline.
		buffer += decoder.decode();
		if (buffer) consumeLine(buffer);
	} catch (err) {
		void reader.cancel().catch(() => {});
		if (isAbortError(err)) throw err;
		throw new Error("The AI response stream was interrupted. Please try again.");
	}

	return fullText;
}
