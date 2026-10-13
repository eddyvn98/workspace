/**
 * Client-side types for the Workspace AI Usage page. They mirror the JSON returned
 * by GET /api/ai-usage (lib/ai-usage/server/usage-query.ts →
 * shapeUsageResponse, and usage-platforms.ts for Workspace Desktop / Claude / All
 * Platforms). Usage analytics only — the API carries no cost, price or
 * currency fields (LiteLLM's spend column and Claude's spend columns are
 * never read).
 */
import type { ClaudeCoverageType, ClaudeImportType, PeriodWarning } from "./claude-period";
import type { GeminiApp, GeminiLimit } from "./gemini";

export type Granularity = "day" | "week" | "month";

/**
 * Which AI platform the page reports on.
 *  - website: Dify interaction events (ai_usage_events) — counted as Requests
 *  - desktop: LiteLLM_SpendLogs rows — counted as Model Calls
 *  - claude:  imported Claude Team monthly reports — counted as Claude
 *             Requests (monthly aggregates, never daily)
 *  - gemini:  imported Gemini rolling 28-day snapshots — Usage Activities,
 *             no tokens; one snapshot is shown at a time, never summed
 *  - all:     every platform; each count stays its own number, tokens are
 *             combined (Gemini has none) and active users are deduplicated
 *             by email (Gemini's 28-day window is shown separately)
 */
export type UsagePlatform = "all" | "website" | "desktop" | "claude" | "gemini";

/** A single source platform (not the All Platforms aggregate). */
export type SourcePlatform = Exclude<UsagePlatform, "all">;

/** Platforms with request/call + token semantics (Gemini reports neither). */
export type TokenPlatform = Exclude<SourcePlatform, "gemini">;

/** Views laid out with the token-based sections (every view except Gemini's own). */
export type TokenView = Exclude<UsagePlatform, "gemini">;

export interface UsageTotals {
	/** Distinct normalized emails (deduplicated across platforms). */
	activeUsers: number;
	/** Workspace Website requests (0 for Workspace Desktop). */
	requests: number;
	/** Requests where Dify reported token numbers (0 counts as reported). */
	requestsWithUsage: number;
	/** Workspace Desktop model calls — LiteLLM_SpendLogs rows (0 for Workspace Website). */
	modelCalls: number;
	/** Model calls that recorded tokens (failed calls record none). */
	modelCallsWithUsage: number;
	/** Claude requests from imported reports (0 for Workspace Website / Desktop). */
	claudeRequests: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

/**
 * Workspace Desktop data state for a response.
 *  - ok:          included
 *  - unavailable: the LiteLLM usage database is not configured or unreachable
 *  - excluded:    a Website-only filter (category) is active, so no model call matches
 */
export interface DesktopState {
	status: "ok" | "unavailable" | "excluded";
	/** Model calls whose LiteLLM user has no email — in every total, attributed to no user. */
	unresolvedModelCalls: number;
}

/**
 * An imported Claude reporting period. Monthly: one calendar month, complete
 * (full_month) or partly covered by the source (partial_month). Historical:
 * one multi-month aggregate that is never subdivided.
 */
export interface ClaudePeriod {
	periodKey: string;
	importType: ClaudeImportType;
	coverageType: ClaudeCoverageType;
	/** YYYY-MM — monthly imports only. */
	reportingMonth: string | null;
	/** Inclusive YYYY-MM-DD span (a partial month's span is the part the source covers). */
	periodStart: string;
	periodEnd: string;
}

/**
 * Claude data state for a response. Claude aggregates are only counted for
 * reporting periods that lie completely inside the date range — never
 * prorated.
 *  - ok:       included as described by `included` / `partial`
 *  - excluded: a Website-only filter (category) is active, so no Claude row matches
 */
export interface ClaudeState {
	status: "ok" | "excluded";
	/** Periods fully inside the selected range (every period for All Time). */
	included: ClaudePeriod[];
	/** Imported periods that only partly overlap the range — left out. */
	partial: ClaudePeriod[];
	/** Whether Claude monthly totals are part of `timeseries` (month grouping; never historical periods). */
	inTimeseries: boolean;
}

export interface ClaudePeriodRow extends UsageTotals, ClaudePeriod {}

export interface ProductRow extends UsageTotals {
	product: string;
}

/** Token totals of one platform — the All Platforms token cards show where tokens come from. */
export interface PlatformTokenTotals {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface UsageSummary extends UsageTotals {
	avgTokensPerUser: number;
	avgTokensPerRequest: number;
	avgTokensPerModelCall: number;
	avgLatencySeconds: number | null;
	firstEventAt: string | null;
	lastEventAt: string | null;
}

export interface TimeseriesPoint extends UsageTotals {
	/** "2026-09-30" (day), "2026-W40" (ISO week) or "2026-09" (month). */
	period: string;
}

export interface CategoryRow extends UsageTotals {
	category: string;
}

export interface DepartmentRow extends UsageTotals {
	departmentId: string | null;
	departmentName: string | null;
}

export interface UserRow {
	email: string;
	departmentId: string | null;
	departmentName: string | null;
	requests: number;
	requestsWithUsage: number;
	modelCalls: number;
	modelCallsWithUsage: number;
	claudeRequests: number;
	/** The user's own Claude tokens (imported Claude reports) — also inside inputTokens/outputTokens, which combine platforms. */
	claudeInputTokens: number;
	claudeOutputTokens: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	averageTokensPerRequest: number;
	averageTokensPerModelCall: number;
	/** Latest Workspace Website / Desktop activity (Claude reports carry no timestamps). */
	lastActive: string | null;
	/** End day (YYYY-MM-DD) of the latest Claude report the user appears in. */
	claudeReportedThrough: string | null;
	/** Gemini "Overall usage" in the applicable rolling 28-day snapshot (0 when none). */
	geminiActivities: number;
	/** Gemini detail of that snapshot; null when the user is not in it. */
	gemini: GeminiUserDetail | null;
}

// ── Gemini (rolling 28-day snapshots) ────────────────────────────────────────

export interface GeminiSnapshotInfo {
	snapshotKey: string;
	/** YYYY-MM-DD the report was exported — not a period start or end. */
	snapshotDate: string;
	windowType: "rolling_28_days";
	windowLengthDays: 28;
}

/** Totals of ONE snapshot (never of several). */
export interface GeminiSummary {
	/** Sum of "Overall usage". */
	usageActivities: number;
	/** Users with usage or at least one active day in the window. */
	activeUsers: number;
	usersInReport: number;
	/** Sum of each user's "Active days". */
	activeDays: number;
	/** Sum of each user's "Days at limit". */
	daysAtLimit: number;
}

export interface GeminiAppRow {
	app: GeminiApp;
	usage: number;
	/** Users with usage in this app. */
	users: number;
}

export interface GeminiTrendPoint extends GeminiSummary {
	snapshotDate: string;
}

export interface GeminiDepartmentRow extends GeminiSummary {
	departmentId: string | null;
	departmentName: string | null;
}

export interface GeminiUserDetail {
	activeDays: number | null;
	daysAtLimit: number | null;
	/** Non-zero app counts only. */
	apps: Partial<Record<GeminiApp, number>>;
}

/**
 * Gemini state for a response.
 *  - ok:       `snapshot` is the latest snapshot dated inside the range (All
 *              Time: the latest overall); null = none in the range
 *  - excluded: a filter Gemini cannot match (category, model, …) is active
 */
export interface GeminiState {
	status: "ok" | "excluded";
	snapshot: GeminiSnapshotInfo | null;
	/** Snapshots dated inside the range (trend points). */
	snapshotsInRange: number;
	/** Any Gemini snapshot imported at all. */
	hasSnapshots: boolean;
}

export interface GeminiDashboard {
	state: GeminiState;
	/** The selected snapshot's totals; null when there is none. */
	summary: GeminiSummary | null;
	apps: GeminiAppRow[];
	byDepartment: GeminiDepartmentRow[];
	/** One point per snapshot in the range, oldest first — compact, never summed. */
	trend: GeminiTrendPoint[];
}

export interface ModelRow extends UsageTotals {
	model: string;
}

export interface AIUsageReport {
	platforms: string[];
	filters: {
		dateFrom: string | null;
		dateTo: string | null;
		departments: string[];
		users: string[];
		categories: string[];
		models: string[];
		statuses: string[];
		sources: string[];
	};
	granularity: Granularity;
	timezone: string;
	summary: UsageSummary;
	timeseries: TimeseriesPoint[];
	byCategory: CategoryRow[];
	byDepartment: DepartmentRow[];
	byUser: UserRow[];
	byModel: ModelRow[];
	coverage: {
		bySource: Record<string, number>;
		byStatus: Record<string, number>;
	};
	truncated: { byUser: boolean };
}

/** GET /api/ai-usage?view=dashboard — everything on screen except the user table. */
export interface AIUsageDashboard {
	/** The platform these numbers belong to (the page lays out from this, not from the filter). */
	platform: UsagePlatform;
	granularity: Granularity;
	timezone: string;
	summary: UsageSummary;
	/** Workspace Website totals alone (category sections); null for Workspace Desktop. */
	websiteSummary: UsageSummary | null;
	/** Same filters over the preceding period (KPI deltas); null when not requested. */
	previousSummary: UsageSummary | null;
	timeseries: TimeseriesPoint[];
	/** Workspace Website categories only — Desktop model calls and Claude reports carry no category. */
	byCategory: CategoryRow[];
	byDepartment: DepartmentRow[];
	byModel: ModelRow[];
	/** Claude products (Claude and All Platforms); empty otherwise. */
	byProduct: ProductRow[];
	/** One row per included Claude reporting period, oldest first (Claude and All Platforms). */
	claudePeriods: ClaudePeriodRow[];
	topUsers: { byRequests: UserRow[]; byModelCalls: UserRow[]; byClaudeRequests: UserRow[]; byGeminiActivities: UserRow[]; byTokens: UserRow[] };
	/**
	 * Each token platform's own totals (All Platforms only): its count, its
	 * active users and its tokens. Absent = the platform is unavailable or
	 * excluded. Gemini is in `gemini` (it has no tokens).
	 */
	platformTotals: Partial<Record<TokenPlatform, UsageTotals>> | null;
	coverage: AIUsageReport["coverage"];
	/** null when Workspace Desktop is not part of the platform. */
	desktop: DesktopState | null;
	/** null when Claude is not part of the platform. */
	claude: ClaudeState | null;
	/** null when Gemini is not part of the platform. */
	gemini: GeminiDashboard | null;
}

/** What the Usage Trend can rank users by (Active Users counts users, so it ranks nobody). */
export type TrendMetric = "requests" | "modelCalls" | "claudeRequests" | "totalTokens" | "inputTokens" | "outputTokens";

/** One manually selected user's own trend (Usage Trend comparison). */
export interface UserTrendSeries {
	email: string;
	timeseries: TimeseriesPoint[];
}

/**
 * GET /api/ai-usage?view=trend — the Usage Trend scoped to manually selected
 * users (trendUser, up to 8) or to the top N users (top) by a metric over
 * the selected range, with the same filters and per-period semantics as the
 * dashboard's `timeseries`.
 */
export interface UsageTrend {
	platform: UsagePlatform;
	granularity: Granularity;
	timezone: string;
	/** The users the trend covers: the selected users (selection order), or the ranked top N with usage (fewer when fewer have any). */
	users: string[];
	/** The covered users together (every user counted once per period). */
	timeseries: TimeseriesPoint[];
	/** Manual selection only: one series per selected user, in `users` order. */
	series?: UserTrendSeries[];
}

export type UserSortKey =
	| "email"
	| "department"
	| "requests"
	| "modelCalls"
	| "claudeRequests"
	| "claudeInputTokens"
	| "claudeOutputTokens"
	| "geminiActivities"
	| "geminiActiveDays"
	| "geminiDaysAtLimit"
	| "inputTokens"
	| "outputTokens"
	| "totalTokens"
	| "avgTokens"
	| "lastActive";

export interface UsersTableState {
	page: number;
	pageSize: number;
	sort: UserSortKey;
	dir: "asc" | "desc";
	search: string;
	/** Department label as shown in the table; null = all. */
	department: string | null;
}

/** GET /api/ai-usage?view=users — one page of the user table. */
export interface UsersTablePage {
	platform: UsagePlatform;
	/** null when Workspace Desktop is not part of the platform. */
	desktop: DesktopState | null;
	/** null when Claude is not part of the platform. */
	claude: ClaudeState | null;
	/** null when Gemini is not part of the platform. */
	gemini: GeminiState | null;
	page: number;
	pageSize: number;
	/** Users matching the table search/department (all pages). */
	total: number;
	rows: UserRow[];
	/** Department labels of every user in the filtered period (table dropdown). */
	departments: string[];
}

export interface OptionDepartment {
	departmentId: string | null;
	departmentName: string | null;
}

export interface OptionUser {
	email: string;
	departmentId: string | null;
	departmentName: string | null;
}

/**
 * GET /api/ai-usage?view=options — filter dropdown values (all time,
 * unfiltered). The top level is Workspace Website; `desktop` and `claude` hold
 * those platforms' values, so one cached request serves every platform and
 * switching platform never refetches options.
 */
export interface AIUsageOptions {
	categories: string[];
	departments: OptionDepartment[];
	users: OptionUser[];
	models: string[];
	firstEventAt: string | null;
	lastEventAt: string | null;
	desktop: {
		status: "ok" | "unavailable";
		departments: OptionDepartment[];
		users: OptionUser[];
		models: string[];
		firstEventAt: string | null;
		lastEventAt: string | null;
	};
	claude: {
		departments: OptionDepartment[];
		users: OptionUser[];
		models: string[];
		/** Start of the earliest imported reporting period (local midnight). */
		firstEventAt: string | null;
		lastEventAt: string | null;
	};
	gemini: {
		departments: OptionDepartment[];
		users: OptionUser[];
		/** Earliest snapshot date (local midnight). */
		firstEventAt: string | null;
		lastEventAt: string | null;
	};
}

// ── Filters ──────────────────────────────────────────────────────────────────

export type DatePreset =
	| "today"
	| "yesterday"
	| "last7"
	| "last30"
	| "thisMonth"
	| "lastMonth"
	| "thisQuarter"
	| "thisYear"
	| "allTime"
	| "custom";

export interface DateRange {
	from: Date;
	to: Date;
}

export interface UsageFilters {
	platform: UsagePlatform;
	datePreset: DatePreset;
	/** Only read when datePreset === "custom". */
	customRange: DateRange | null;
	/** "auto" picks day/week/month from the range length. */
	granularity: Granularity | "auto";
	/** Empty array = all. */
	categories: string[];
	/** Department ids (the API matches id or name). */
	departments: string[];
	/** Normalized emails. */
	users: string[];
	models: string[];
}

// ── Claude report import ─────────────────────────────────────────────────────

export interface ClaudeImportSummary {
	users: number;
	records: number;
	models: number;
	products: number;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	matchedUsers: number;
	unmatchedUsers: number;
}

export interface ExistingImportInfo {
	importId: string;
	originalFileName: string;
	importedAt: string;
	importedBy: string;
	rowCount: number;
	userCount: number;
}

/** POST /api/ai-usage/claude/imports (action=preview) — compact; no rows are sent back. */
export interface ClaudeImportPreview {
	ok: boolean;
	/** Blocking problems; nothing can be imported while any exist. */
	errors: string[];
	importType: ClaudeImportType;
	fileName: string;
	reportingMonth: string | null;
	periodStart: string | null;
	periodEnd: string | null;
	periodLabel: string | null;
	/** Set once the period is valid. */
	coverageType: ClaudeCoverageType | null;
	isCompleteMonth: boolean | null;
	/** Non-blocking notices shown before import (partial month coverage). */
	warnings: PeriodWarning[];
	summary: ClaudeImportSummary | null;
	/** Claude emails with no Workspace employee match (shown as Unassigned; usage kept). */
	unmatchedEmails: string[];
	/** The period already has an active report — importing requires an explicit replace. */
	existing: ExistingImportInfo | null;
}

export interface ClaudeCoverageEntry {
	periodKey: string;
	importType: ClaudeImportType;
	/** null for a missing month. */
	coverageType: ClaudeCoverageType | null;
	reportingMonth: string | null;
	periodStart: string;
	periodEnd: string;
	label: string;
	/** complete = full_month, partial = partial_month, historical = historical_multi_month. */
	status: "complete" | "partial" | "historical" | "missing";
	import: (ExistingImportInfo & { matchedUserCount: number; unmatchedUserCount: number; replacedCount: number }) | null;
}

/** GET /api/ai-usage/claude/imports — imported periods plus expected months without a report. */
export interface ClaudeCoverage {
	entries: ClaudeCoverageEntry[];
	/** Last complete calendar month (the latest monthly report that should exist). */
	lastCompleteMonth: string;
}

// ── Platform export (view=export) ────────────────────────────────────────────

export interface ClaudeExportUser extends UserRow {
	/** Claude account emails behind this person (differs from `email` when resolved via an alias). */
	claudeEmails: string[];
}

/** One (reporting period, user, product, model) row of the Claude export. */
export interface ClaudeDetailRow extends ClaudePeriod {
	email: string;
	claudeEmails: string[];
	departmentId: string | null;
	departmentName: string | null;
	product: string;
	model: string;
	claudeRequests: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

/**
 * GET /api/ai-usage?view=export&platform=desktop|claude|all — the Excel
 * export payload for every platform except Workspace Website (which keeps the
 * full view). Fetched only when Export is clicked.
 */
export interface PlatformExportReport {
	platform: Exclude<UsagePlatform, "website">;
	granularity: Granularity;
	timezone: string;
	/** All Platforms: active users deduplicated across platforms, tokens combined. */
	combined: { summary: UsageSummary; platformTokens: Partial<Record<TokenPlatform, PlatformTokenTotals>> } | null;
	/**
	 * All Platforms: the rows of the page's User Usage Details table for the
	 * same filters (one row per person, platforms merged by email, ordered by
	 * total tokens). `websiteTruncated` = the Workspace Website part hit the export
	 * user limit. null for the other platforms.
	 */
	userDetails?: { rows: UserRow[]; websiteTruncated: boolean } | null;
	/** All Platforms: the complete Workspace Website report (same as the full view). */
	website: AIUsageReport | null;
	desktop: {
		state: DesktopState;
		summary: UsageSummary;
		timeseries: TimeseriesPoint[];
		byModel: ModelRow[];
		byDepartment: DepartmentRow[];
		byUser: UserRow[];
	} | null;
	claude: {
		state: ClaudeState;
		summary: UsageSummary;
		periods: ClaudePeriodRow[];
		byModel: ModelRow[];
		byProduct: ProductRow[];
		byDepartment: DepartmentRow[];
		byUser: ClaudeExportUser[];
		details: ClaudeDetailRow[];
		coverage: ClaudeCoverage;
	} | null;
	/** One snapshot (the applicable one) plus the snapshot history — never a sum of snapshots. */
	gemini: {
		state: GeminiState;
		summary: GeminiSummary | null;
		apps: GeminiAppRow[];
		byDepartment: GeminiDepartmentRow[];
		byUser: GeminiExportUser[];
		trend: GeminiTrendPoint[];
		history: GeminiHistoryEntry[];
	} | null;
}

export interface GeminiExportUser {
	email: string;
	geminiEmails: string[];
	departmentId: string | null;
	departmentName: string | null;
	overallUsage: number;
	activeDays: number | null;
	daysAtLimit: number | null;
	active: boolean;
	apps: Partial<Record<GeminiApp, number>>;
	limits: Partial<Record<GeminiLimit, number>>;
}

// ── Gemini snapshot import ───────────────────────────────────────────────────

export interface GeminiImportSummary {
	usersInReport: number;
	activeUsers: number;
	overallUsage: number;
	activeDays: number;
	daysAtLimit: number;
	matchedUsers: number;
	unmatchedUsers: number;
	/** Every app with usage, largest first. */
	apps: GeminiAppRow[];
}

/** POST /api/ai-usage/gemini/imports (action=preview) — compact; no rows are sent back. */
export interface GeminiImportPreview {
	ok: boolean;
	errors: string[];
	/** Non-blocking notices (e.g. known columns missing from this export). */
	warnings: string[];
	fileName: string;
	/** null until a valid date is known. */
	snapshotDate: string | null;
	snapshotDateSource: "file_name" | "manual" | null;
	/** The file name has no date — the admin must enter the snapshot (export) date. */
	needsSnapshotDate: boolean;
	windowType: "rolling_28_days";
	windowLengthDays: 28;
	summary: GeminiImportSummary | null;
	unmatchedEmails: string[];
	/** A snapshot with this date exists — importing requires an explicit replace. */
	existing: ExistingImportInfo | null;
}

/** GET /api/ai-usage/gemini/imports — every snapshot, newest first. */
export interface GeminiHistoryEntry {
	snapshotKey: string;
	snapshotDate: string;
	windowType: "rolling_28_days";
	windowLengthDays: 28;
	importId: string;
	originalFileName: string;
	importedAt: string;
	importedBy: string;
	usersInReport: number;
	activeUsers: number;
	overallUsage: number;
	matchedUserCount: number;
	unmatchedUserCount: number;
	replacedCount: number;
}
