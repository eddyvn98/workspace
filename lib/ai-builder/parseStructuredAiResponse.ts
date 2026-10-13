// File: lib/ai-builder/parseStructuredAiResponse.ts
//
// Shared "the model was asked for JSON, get a real object back" helper for the
// AI Builders. Models routinely wrap structured answers in ```json fences or
// bracket them with prose, so a plain `indexOf("{")`/`lastIndexOf("}")` slice
// either fails outright or captures a malformed span. This module strips fences,
// scans for balanced (string-aware) JSON objects and validates the fields the
// caller declared required.
//
// Schema knowledge stays with the caller: this module only guarantees "a plain
// object that has these string fields", never what a Skill or a Prompt means.

export interface StructuredParseOptions<T> {
	/** Name of the thing being generated ("skill", "prompt"); used in error text. */
	label: string;
	/** Keys that must arrive as non-empty strings for the result to be usable. */
	requiredFields: Array<Extract<keyof T, string>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Contents of every ``` fenced block, in document order. */
function fencedBlocks(text: string): string[] {
	const blocks: string[] = [];
	const fence = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = fence.exec(text)) !== null) {
		const block = match[1].trim();
		if (block) blocks.push(block);
	}
	return blocks;
}

/**
 * Every balanced `{...}` span in `text`, outermost first. Brace counting ignores
 * braces inside JSON strings and honours backslash escapes, so prose or nested
 * objects around/inside the payload can't truncate the span the way a
 * last-index-of scan does.
 */
function balancedObjects(text: string): string[] {
	const found: string[] = [];
	let depth = 0;
	let start = -1;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			if (depth === 0) start = i;
			depth++;
			continue;
		}
		if (char === "}") {
			if (depth === 0) continue;
			depth--;
			if (depth === 0 && start !== -1) {
				found.push(text.slice(start, i + 1));
				start = -1;
			}
		}
	}

	return found;
}

/** Ordered, de-duplicated list of strings worth attempting `JSON.parse` on. */
function candidateJsonStrings(raw: string): string[] {
	const trimmed = raw.trim();
	const candidates: string[] = [];

	// Fenced blocks are the most explicit signal of "here is the JSON".
	for (const block of fencedBlocks(trimmed)) {
		candidates.push(block);
		candidates.push(...balancedObjects(block));
	}
	candidates.push(trimmed);
	candidates.push(...balancedObjects(trimmed));

	return Array.from(new Set(candidates.map((c) => c.trim()).filter((c) => c.startsWith("{"))));
}

/**
 * Parses a structured AI answer, or throws an `Error` whose message can be shown
 * to the user as-is. Never returns a partially valid object: a result missing any
 * `requiredFields` entry is rejected rather than silently accepted.
 */
export function parseStructuredAiResponse<T extends Record<string, unknown>>(
	raw: string,
	options: StructuredParseOptions<T>,
): T {
	const { label, requiredFields } = options;

	if (!raw || !raw.trim()) {
		throw new Error(`The AI returned an empty ${label} response. Please try generating again.`);
	}

	let parsed: Record<string, unknown> | null = null;
	for (const candidate of candidateJsonStrings(raw)) {
		try {
			const value: unknown = JSON.parse(candidate);
			if (isPlainObject(value)) {
				parsed = value;
				break;
			}
		} catch {
			// Not this span — keep scanning the remaining candidates.
		}
	}

	if (!parsed) {
		throw new Error(`The AI did not return a valid ${label} JSON object. Please try generating again.`);
	}

	const missing = requiredFields.filter((field) => {
		const value = parsed?.[field];
		return typeof value !== "string" || !value.trim();
	});

	if (missing.length > 0) {
		throw new Error(
			`The generated ${label} is missing required field(s): ${missing.join(", ")}. Please try generating again.`,
		);
	}

	return parsed as T;
}
