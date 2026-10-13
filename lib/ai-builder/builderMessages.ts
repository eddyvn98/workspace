// File: lib/ai-builder/builderMessages.ts
//
// Transcript helpers shared by the Skill Builder and the Prompt Builder. Both
// keep their conversation in their own store (never in the normal chat's
// `useMessageStore`), but the turn bookkeeping is identical, so it lives here.

export interface BuilderMessage {
	role: "user" | "assistant";
	content: string;
}

/**
 * Appends the user turn plus the empty assistant turn that the stream fills in.
 * Rendering the placeholder immediately is what lets the UI show a loading
 * bubble instead of a gap while the first delta is in flight.
 */
export function appendUserTurn(messages: BuilderMessage[], content: string): BuilderMessage[] {
	return [...messages, { role: "user", content }, { role: "assistant", content: "" }];
}

/** Replaces the trailing assistant turn's content with the streamed text so far. */
export function withAssistantText(messages: BuilderMessage[], content: string): BuilderMessage[] {
	if (messages.length === 0) return [{ role: "assistant", content }];
	const next = [...messages];
	next[next.length - 1] = { role: "assistant", content };
	return next;
}

/**
 * Drops a trailing assistant turn that never received any text. Called when a
 * request fails so the transcript doesn't keep an empty bubble around — the
 * failure is reported through the builder's error state instead.
 */
export function dropPendingAssistant(messages: BuilderMessage[]): BuilderMessage[] {
	const last = messages[messages.length - 1];
	if (last && last.role === "assistant" && !last.content) return messages.slice(0, -1);
	return messages;
}

/** True once the user has contributed at least one turn worth generating from. */
export function hasUserTurn(messages: BuilderMessage[]): boolean {
	return messages.some((m) => m.role === "user" && m.content.trim().length > 0);
}

/** Flattens the transcript for embedding in a generation instruction. */
export function formatBuilderTranscript(messages: BuilderMessage[]): string {
	return messages
		.filter((m) => m.content.trim().length > 0)
		.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
		.join("\n");
}
