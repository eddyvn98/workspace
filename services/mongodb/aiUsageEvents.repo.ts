import type { Document } from "mongodb";
import { getMongoAiDb } from "./client";
import type { AIUsageEventDoc } from "@/lib/ai-usage/server/usage-event.types";
import { effectiveDepartmentStages } from "@/lib/ai-usage/server/effective-department";

// Lives next to chat_sessions in the workspace_ai database.
const COLLECTION = "ai_usage_events";
const BACKFILL_STATE_COLLECTION = "ai_usage_backfill_state";

// Same lazy-ensure pattern as chatSessions.repo.ts.
let indexesEnsured = false;
async function ensureIndexes(): Promise<void> {
	if (indexesEnsured) return;
	indexesEnsured = true;
	try {
		const db = await getMongoAiDb();
		const collection = db.collection(COLLECTION);
		await Promise.all([
			collection.createIndex({ platform: 1, createdAt: -1 }),
			collection.createIndex({ normalizedEmail: 1, createdAt: -1 }),
			collection.createIndex({ category: 1, createdAt: -1 }),
			collection.createIndex({ departmentId: 1, createdAt: -1 }),
			collection.createIndex({ conversationId: 1 }),
		]);
	} catch (err) {
		console.error("[aiUsageEvents.repo] failed to ensure indexes:", err);
	}
}

export interface InsertUsageEventsResult {
	inserted: number;
	duplicates: number;
	/** Existing events that had no token usage and received it from backfill. */
	enriched: number;
}

/**
 * Insert-if-absent by the deterministic `_id` (dedupe key). An existing event
 * is never overwritten — with one narrow exception for backfill: an event
 * persisted without token usage (e.g. a realtime stream the user aborted)
 * may receive the token numbers Dify later reports for the same message.
 * Existing token values are never replaced.
 */
export async function insertUsageEvents(docs: AIUsageEventDoc[]): Promise<InsertUsageEventsResult> {
	if (docs.length === 0) return { inserted: 0, duplicates: 0, enriched: 0 };
	await ensureIndexes();
	const db = await getMongoAiDb();
	const collection = db.collection<AIUsageEventDoc>(COLLECTION);

	const result = await collection.bulkWrite(
		docs.map((doc) => {
			const { _id, ...rest } = doc;
			return {
				updateOne: {
					filter: { _id },
					update: { $setOnInsert: rest },
					upsert: true,
				},
			};
		}),
		{ ordered: false },
	);
	const inserted = result.upsertedCount;
	const insertedIds = new Set(Object.values(result.upsertedIds ?? {}).map(String));

	const enrichable = docs.filter(
		(doc) => doc.source === "backfill" && doc.totalTokens !== null && !insertedIds.has(doc._id),
	);
	let enriched = 0;
	if (enrichable.length > 0) {
		const now = new Date();
		const enrichResult = await collection.bulkWrite(
			enrichable.map((doc) => ({
				updateOne: {
					filter: { _id: doc._id, totalTokens: null },
					update: {
						$set: {
							inputTokens: doc.inputTokens,
							outputTokens: doc.outputTokens,
							totalTokens: doc.totalTokens,
							latencySeconds: doc.latencySeconds,
							usageAvailable: true,
							enrichedAt: now,
						},
					},
				},
			})),
			{ ordered: false },
		);
		enriched = enrichResult.modifiedCount;
	}

	// A backfill may win the insert race. Preserve later realtime measurements without overwriting them.
	const measured = docs.filter((doc) => doc.source === "realtime" && !insertedIds.has(doc._id));
	const measurements = measured.flatMap((doc) =>
		(["observedDurationMs", "workspaceTurnId"] as const).flatMap((field) => doc[field] === undefined ? [] : [{
			updateOne: {
				filter: { _id: doc._id, [field]: { $exists: false } },
				update: { $set: { [field]: doc[field],
					...(doc.workspaceTurnId ? { feature: doc.feature } : {}),
				} },
			},
		}]),
	);
	if (measurements.length) await collection.bulkWrite(measurements, { ordered: false });

	return { inserted, duplicates: docs.length - inserted, enriched };
}

export async function aggregateUsageEvents<T extends Document = Document>(
	pipeline: Record<string, unknown>[],
): Promise<T[]> {
	await ensureIndexes();
	const db = await getMongoAiDb();
	const collection = db.collection(COLLECTION);
	const effective = await effectiveDepartmentStages(collection, "normalizedEmail");
	return collection.aggregate<T>([...effective, ...pipeline], { allowDiskUse: true }).toArray();
}

// ── Backfill bookkeeping ─────────────────────────────────────────────────────

export interface BackfillStateDoc {
	_id: string;
	target: string;
	difyUser: string;
	conversationId: string;
	/** Dify conversation updated_at (unix seconds) at the time it was processed. */
	conversationUpdatedAt: number | null;
	messages: number;
	processedAt: Date;
}

export async function getBackfillStates(ids: string[]): Promise<Map<string, BackfillStateDoc>> {
	if (ids.length === 0) return new Map();
	const db = await getMongoAiDb();
	const docs = await db
		.collection<BackfillStateDoc>(BACKFILL_STATE_COLLECTION)
		.find({ _id: { $in: ids } })
		.toArray();
	return new Map(docs.map((d) => [d._id, d]));
}

export async function saveBackfillState(state: BackfillStateDoc): Promise<void> {
	const db = await getMongoAiDb();
	const { _id, ...rest } = state;
	await db
		.collection<BackfillStateDoc>(BACKFILL_STATE_COLLECTION)
		.updateOne({ _id }, { $set: rest }, { upsert: true });
}
