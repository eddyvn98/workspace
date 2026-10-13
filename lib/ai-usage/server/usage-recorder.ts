/**
 * Server-side recorder for Workspace → Dify usage. Every entry point is
 * fire-and-forget: it never throws, never awaits on the caller's response
 * path, and a persistence failure is only logged (without payloads,
 * identities' tokens or secrets). Set AI_USAGE_CAPTURE_DISABLED=true to turn
 * capture off without a deploy of code changes.
 */
import { normalizeEmail } from "@/lib/normalize-email";
import { insertUsageEvents } from "@/services/mongodb/aiUsageEvents.repo";
import { lookupDepartment, type DepartmentInfo } from "./department-lookup";
import {
	captureFromBlockingResponse,
	difyHostFromUrl,
	type DifyCapture,
} from "./dify-usage-extract";
import { createDifyStreamObserver, type DifyStreamObserver } from "./dify-stream-observer";
import type { AIUsageEventDoc, AIUsageSource } from "./usage-event.types";

export interface UsageCaptureContext {
	/** Server-side authenticated identity (never the browser-supplied `user`). */
	email: string;
	/** Exact `user` string sent to Dify; defaults to `email`. */
	difyUser?: string;
	category: string;
	feature?: string | null;
	/** Dify endpoint URL the request went to (only the host is stored). */
	difyUrl?: string | null;
	/** Model Workspace requested (see requestedModelFromInputs). */
	requestedModel?: string | null;
	observedDurationMs?: number;
	workspaceTurnId?: string;
}

export const PLATFORM_WORKSPACE = "Workspace" as const;

/**
 * Stable identity of a Dify message/run: host + message id (chat/chatflow)
 * or host + workflow run id (workflow apps). Realtime capture and backfill
 * derive the same key for the same Dify record. Returns null when Dify gave
 * no id — such events are not persisted (no timestamp-based fallback).
 */
export function buildUsageEventKey(input: {
	difyHost: string | null;
	messageId: string | null;
	workflowRunId: string | null;
}): string | null {
	const host = (input.difyHost ?? "unknown-host").toLowerCase();
	if (input.messageId) return `${PLATFORM_WORKSPACE}|${host}|msg|${input.messageId}`;
	if (input.workflowRunId) return `${PLATFORM_WORKSPACE}|${host}|run|${input.workflowRunId}`;
	return null;
}

function resolveModel(ctx: UsageCaptureContext, capture: DifyCapture) {
	if (ctx.requestedModel) return { model: ctx.requestedModel, modelSource: "requested" as const };
	const distinct = [...new Set(capture.nodeModels)];
	// Only a single, unambiguous node model is used; several are kept in
	// difyNodeModels but not collapsed into a guess.
	if (distinct.length === 1) return { model: distinct[0], modelSource: "dify-node" as const };
	return { model: null, modelSource: null };
}

export function buildUsageEventDoc(
	ctx: UsageCaptureContext,
	capture: DifyCapture,
	source: AIUsageSource,
	department: DepartmentInfo,
	now: Date = new Date(),
	difyHostOverride?: string | null,
): AIUsageEventDoc | null {
	const difyHost = difyHostOverride ?? difyHostFromUrl(ctx.difyUrl);
	const key = buildUsageEventKey({ difyHost, messageId: capture.messageId, workflowRunId: capture.workflowRunId });
	if (!key) return null;
	const email = ctx.email.trim();
	const usage = capture.usage;
	const { model, modelSource } = resolveModel(ctx, capture);
	return {
		_id: key,
		platform: PLATFORM_WORKSPACE,
		email,
		normalizedEmail: normalizeEmail(email),
		difyUser: ctx.difyUser ?? email,
		departmentId: department.departmentId,
		departmentName: department.departmentName,
		departmentIds: department.departmentIds,
		category: ctx.category,
		feature: ctx.feature ?? null,
		...(Number.isFinite(ctx.observedDurationMs) && ctx.observedDurationMs! >= 0
			? { observedDurationMs: Math.round(ctx.observedDurationMs!) } : {}),
		...(ctx.category === "WORKSPACE_AGENT_CHAT_KEY" && /^[A-Za-z0-9:_-]{1,128}$/.test(ctx.workspaceTurnId ?? "")
			? { workspaceTurnId: ctx.workspaceTurnId } : {}),
		appMode: capture.appMode,
		difyHost,
		conversationId: capture.conversationId,
		messageId: capture.messageId,
		workflowRunId: capture.workflowRunId,
		model,
		modelSource,
		difyNodeModels: [...new Set(capture.nodeModels)],
		inputTokens: usage?.inputTokens ?? null,
		outputTokens: usage?.outputTokens ?? null,
		totalTokens: usage?.totalTokens ?? null,
		latencySeconds: usage?.latencySeconds ?? null,
		usageAvailable: usage?.totalTokens != null,
		status: capture.status,
		source,
		createdAt: capture.createdAt ?? now,
		capturedAt: now,
	};
}

function captureDisabled(): boolean {
	// "1" is accepted too: production once set it and capture silently stayed on.
	const flag = process.env.AI_USAGE_CAPTURE_DISABLED;
	return flag === "true" || flag === "1";
}

const NOOP_STREAM_OBSERVER: DifyStreamObserver = {
	onBytes() {},
	onEvent() {},
	finish() {},
};

/** Awaitable core, exported for tests; production callers use recordDifyCapture. */
export async function persistRealtimeCapture(
	ctx: UsageCaptureContext,
	capture: DifyCapture,
): Promise<"inserted" | "duplicate" | "skipped"> {
	if (captureDisabled() || !ctx.email?.trim()) return "skipped";
	const department = await lookupDepartment(normalizeEmail(ctx.email)).catch(() => ({
		departmentId: null,
		departmentName: null,
		departmentIds: [],
	}));
	const doc = buildUsageEventDoc(ctx, capture, "realtime", department);
	if (!doc) return "skipped";
	const result = await insertUsageEvents([doc]);
	return result.inserted > 0 ? "inserted" : "duplicate";
}

export function recordDifyCapture(ctx: UsageCaptureContext, capture: DifyCapture): void {
	try {
		void persistRealtimeCapture(ctx, capture).catch((err: unknown) => {
			console.error("[ai-usage] failed to persist usage event", {
				category: ctx.category,
				feature: ctx.feature ?? null,
				message: err instanceof Error ? err.message : String(err),
			});
		});
	} catch {
		// Never propagate into the caller.
	}
}

/** For blocking JSON responses — call before the caller extracts `answer`. */
export function recordDifyBlockingResponse(ctx: UsageCaptureContext, payload: unknown): void {
	try {
		const capture = captureFromBlockingResponse(payload);
		if (capture) recordDifyCapture(ctx, capture);
	} catch {
		// Never propagate into the caller.
	}
}

/** Observer for a forwarded Dify response (SSE or blocking JSON). When capture
 *  is disabled it returns a no-op, so the stream is not decoded or parsed. */
export function createUsageStreamObserver(
	ctx: UsageCaptureContext,
	contentType: string | null,
): DifyStreamObserver {
	if (captureDisabled()) return NOOP_STREAM_OBSERVER;
	const startedAt = performance.now();
	return createDifyStreamObserver({
		contentType,
		onCapture: (capture) => recordDifyCapture({
			...ctx, observedDurationMs: performance.now() - startedAt,
		}, capture),
	});
}
