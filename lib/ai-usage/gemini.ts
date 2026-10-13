/**
 * Gemini usage — shared by the import API (authoritative) and the UI.
 *
 * A Gemini CSV ("Gemini User Raw Data_20261001.csv") is a ROLLING 28-DAY
 * SNAPSHOT exported on its snapshot date. It has no start or end date and no
 * token data. Each import is an independent observation: snapshots are never
 * summed, subtracted or split into days or months, and no start date is
 * derived from the snapshot date.
 */

export const GEMINI_WINDOW_TYPE = "rolling_28_days" as const;
export const GEMINI_WINDOW_DAYS = 28;

/** App dimensions of the report, in display order. */
export const GEMINI_APPS = [
	{ key: "geminiApp", header: "gemini app", label: "Gemini app" },
	{ key: "gmail", header: "gmail", label: "Gmail" },
	{ key: "docs", header: "docs", label: "Docs" },
	{ key: "sheets", header: "sheets", label: "Sheets" },
	{ key: "slides", header: "slides", label: "Slides" },
	{ key: "drive", header: "drive", label: "Drive" },
	{ key: "meet", header: "meet", label: "Meet" },
	{ key: "chat", header: "chat", label: "Chat" },
	{ key: "calendar", header: "calendar", label: "Calendar" },
	{ key: "studio", header: "studio", label: "Studio" },
	{ key: "vids", header: "vids", label: "Vids" },
] as const;

export type GeminiApp = (typeof GEMINI_APPS)[number]["key"];

/** Per-feature quota columns ("Days at limit for …"). */
export const GEMINI_LIMITS = [
	{ key: "daysAtLimitForAiFunction", header: "days at limit for ai function", label: "AI function" },
	{ key: "daysAtLimitForAudioOverviewsForPdfs", header: "days at limit for audio overviews for pdfs", label: "Audio overviews for PDFs" },
	{ key: "daysAtLimitForAvatarGenerationInVids", header: "days at limit for avatar generation in vids", label: "Avatar generation in Vids" },
	{ key: "daysAtLimitForFlowRunsInStudio", header: "days at limit for flow runs in studio", label: "Flow runs in Studio" },
	{ key: "daysAtLimitForNanoBananaPro", header: "days at limit for nano banana pro", label: "Nano Banana Pro" },
	{ key: "daysAtLimitForVideoGeneration", header: "days at limit for video generation", label: "Video generation" },
] as const;

export type GeminiLimit = (typeof GEMINI_LIMITS)[number]["key"];

export const GEMINI_APP_LABEL = Object.fromEntries(GEMINI_APPS.map((a) => [a.key, a.label])) as Record<GeminiApp, string>;
export const GEMINI_LIMIT_LABEL = Object.fromEntries(GEMINI_LIMITS.map((l) => [l.key, l.label])) as Record<GeminiLimit, string>;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

function isCalendarDay(day: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
	const [y, m, d] = day.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Snapshot (export) date from the file name: "…_20261001.csv" or
 * "…2026-10-01…". The date is when the report was exported — never a period
 * start or end. null when the name carries no valid date.
 */
export function parseSnapshotDate(fileName: string): string | null {
	const compact = /(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/.exec(fileName);
	const dashed = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:[^\d]|$)/.exec(fileName);
	for (const m of [compact, dashed]) {
		if (!m) continue;
		const day = `${m[1]}-${m[2]}-${m[3]}`;
		if (isCalendarDay(day)) return day;
	}
	return null;
}

export function isSnapshotDate(day: string): boolean {
	return isCalendarDay(day);
}

/** "October 1, 2026" */
export function formatSnapshotLong(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "1 Oct 2026" */
export function formatSnapshot(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "Oct 1" (chart axis) */
export function formatSnapshotShort(day: string): string {
	const [, m, d] = day.split("-").map(Number);
	return `${MONTHS_SHORT[m - 1]} ${d}`;
}

export const snapshotKeyOf = (snapshotDate: string) => `snapshot:${snapshotDate}`;
