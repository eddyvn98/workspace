import { randomUUID } from "crypto";
import { getMongoAiDb, StringDoc } from "./client";
import type {
	ChatSession,
	ChatSessionCategory,
	ChatSessionListItem,
	ChatSessionRegion,
} from "@/types/chat-sessions.types";

const COLLECTION = "chat_sessions";

function mapDoc(doc: any): ChatSession {
	return {
		id: String(doc._id),
		userId: doc.userId,
		category: doc.category,
		region: doc.region ?? null,
		difyConversationId: doc.difyConversationId,
		title: doc.title ?? "",
		pinned: Boolean(doc.pinned),
		pinnedAt: doc.pinnedAt instanceof Date ? doc.pinnedAt.toISOString() : doc.pinnedAt ?? null,
		createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
		updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
		workspaceMessages: Array.isArray(doc.workspaceMessages) ? doc.workspaceMessages : undefined,
		workspaceBoardId: typeof doc.workspaceBoardId === "string" ? doc.workspaceBoardId : undefined,
	};
}

function mapListItem(doc: any): ChatSessionListItem {
	return {
		id: String(doc._id),
		title: doc.title ?? "",
		category: doc.category,
		region: doc.region ?? null,
		updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
		pinned: Boolean(doc.pinned),
		difyConversationId: doc.difyConversationId,
	};
}

// Same lazy-ensure pattern as services/mongodb/dailyTask.repo.ts — this repo
// is the first thing to touch the workspace_ai database, so indexes don't exist yet.
let indexesEnsured = false;
async function ensureIndexes(): Promise<void> {
	if (indexesEnsured) return;
	indexesEnsured = true;
	try {
		const db = await getMongoAiDb();
		const collection = db.collection(COLLECTION);
		await Promise.all([
			collection.createIndex({ userId: 1, pinned: -1, updatedAt: -1 }),
			collection.createIndex(
				{ userId: 1, category: 1, region: 1, difyConversationId: 1 },
				{ unique: true },
			),
		]);
	} catch (err) {
		console.error("[chatSessions.repo] failed to ensure indexes:", err);
	}
}

export interface UpsertChatSessionInput {
	userId: string;
	category: ChatSessionCategory;
	region?: ChatSessionRegion;
	difyConversationId: string;
	title?: string;
	workspaceMessages?: unknown[];
	workspaceBoardId?: string;
	/**
	 * Dify's own conversation created_at/updated_at (unix seconds, converted
	 * to Date by the caller) — NOT server "now". Sort order depends on this
	 * being the conversation's real activity time, not upsert-call time;
	 * using server time here is what caused historical (backfilled)
	 * conversations to cluster by category instead of interleaving by real
	 * chronological order. Falls back to server time only when a caller
	 * genuinely has no Dify timestamp to give (shouldn't happen in practice —
	 * both call sites always have one).
	 */
	createdAt?: Date;
	updatedAt?: Date;
}

// Called fire-and-forget right after a Dify response carries a
// conversation_id (see lib/llm/adapters/difyAdapter.ts) — never awaited on
// the user-facing send path. Insert on first message of a conversation,
// bump updatedAt (and title, if a fresh one is supplied) on every later one.
// Returns the resulting doc so the caller (the POST /api/chat-sessions route)
// can hand it back to the client for a cache patch instead of a list refetch.
export async function upsertChatSession(input: UpsertChatSessionInput): Promise<ChatSession> {
	await ensureIndexes();
	const db = await getMongoAiDb();
	const region = input.region ?? null;
	const createdAt = input.createdAt ?? new Date();
	const updatedAt = input.updatedAt ?? new Date();

	const setOnInsert: Record<string, unknown> = {
		_id: randomUUID(),
		userId: input.userId,
		category: input.category,
		region,
		difyConversationId: input.difyConversationId,
		pinned: false,
		pinnedAt: null,
		createdAt,
	};

	const set: Record<string, unknown> = { updatedAt };
	if (input.title) set.title = input.title;
	else setOnInsert.title = "";
	if (input.workspaceMessages) set.workspaceMessages = input.workspaceMessages;
	if (input.workspaceBoardId) set.workspaceBoardId = input.workspaceBoardId;

	const result = await db.collection<StringDoc>(COLLECTION).findOneAndUpdate(
		{
			userId: input.userId,
			category: input.category,
			region,
			difyConversationId: input.difyConversationId,
		},
		{ $set: set, $setOnInsert: setOnInsert },
		{ upsert: true, returnDocument: "after" },
	);
	return mapDoc(result!);
}

export interface ListChatSessionsInput {
	userId: string;
	limit: number;
	cursor?: string;
	categories?: ChatSessionCategory[];
	pinned?: boolean;
	workspaceBoardId?: string;
}

export interface ListChatSessionsResult {
	items: ChatSessionListItem[];
	nextCursor: string | null;
}

interface DecodedCursor {
	p: boolean;
	u: string;
	i: string;
}

function encodeCursor(doc: DecodedCursor): string {
	return Buffer.from(JSON.stringify(doc)).toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor | null {
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
		if (typeof parsed?.p === "boolean" && typeof parsed?.u === "string" && typeof parsed?.i === "string") {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

// Sort is pinned DESC, updatedAt DESC, _id DESC (tiebreaker) — the cursor
// walks the exact same three keys so pages never skip or repeat a row.
export async function listChatSessions(
	input: ListChatSessionsInput,
): Promise<ListChatSessionsResult> {
	await ensureIndexes();
	const db = await getMongoAiDb();

	const filter: Record<string, unknown> = { userId: input.userId };
	if (input.categories?.length) filter.category = { $in: input.categories };
	if (typeof input.pinned === "boolean") filter.pinned = input.pinned;
	const andFilters: Record<string, unknown>[] = [];
	if (input.workspaceBoardId) {
		// A board-scoped Workspace history query must not pull legacy/unscoped
		// conversations into an unrelated board. The owner may still retrieve
		// those conversations through an unscoped category query.
		filter.workspaceBoardId = input.workspaceBoardId;
	}

	if (input.cursor) {
		const decoded = decodeCursor(input.cursor);
		if (decoded) {
			const cursorDate = new Date(decoded.u);
			andFilters.push({ $or: [
				{ pinned: { $lt: decoded.p } },
				{ pinned: decoded.p, updatedAt: { $lt: cursorDate } },
				{ pinned: decoded.p, updatedAt: cursorDate, _id: { $lt: decoded.i } },
			] });
		}
	}
	if (andFilters.length > 0) filter.$and = andFilters;

	const docs = await db
		.collection(COLLECTION)
		.find(filter)
		.sort({ pinned: -1, updatedAt: -1, _id: -1 })
		.limit(input.limit + 1)
		.project({ title: 1, category: 1, region: 1, updatedAt: 1, pinned: 1, difyConversationId: 1 })
		.toArray();

	const hasMore = docs.length > input.limit;
	const page = hasMore ? docs.slice(0, input.limit) : docs;

	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last
			? encodeCursor({
					p: Boolean(last.pinned),
					u: (last.updatedAt instanceof Date ? last.updatedAt : new Date(last.updatedAt)).toISOString(),
					i: String(last._id),
				})
			: null;

	return { items: page.map(mapListItem), nextCursor };
}

export async function getChatSessionById(id: string): Promise<ChatSession | null> {
	const db = await getMongoAiDb();
	const doc = await db.collection<StringDoc>(COLLECTION).findOne({ _id: id });
	return doc ? mapDoc(doc) : null;
}

// Scoped by userId so one user can never pin/unpin another user's session.
export async function setChatSessionPinned(
	id: string,
	userId: string,
	pinned: boolean,
): Promise<ChatSession | null> {
	const db = await getMongoAiDb();
	const result = await db.collection<StringDoc>(COLLECTION).findOneAndUpdate(
		{ _id: id, userId },
		{ $set: { pinned, pinnedAt: pinned ? new Date() : null } },
		{ returnDocument: "after" },
	);
	return result ? mapDoc(result) : null;
}

// Scoped by userId — same ownership rule as setChatSessionPinned.
export async function deleteChatSession(id: string, userId: string): Promise<boolean> {
	const db = await getMongoAiDb();
	const result = await db.collection<StringDoc>(COLLECTION).deleteOne({ _id: id, userId });
	return result.deletedCount > 0;
}
