/**
 * Claude reporting periods — shared by the import API (authoritative) and
 * the import dialog (preliminary check only).
 *
 * Claude Team usage comes from a manually exported CSV with no dates in its
 * rows: each row is an aggregate for the whole report period, which only
 * appears in the file name
 * (`spend-report-<id>-2026-07-02-to-2026-09-30.csv`, both days inclusive).
 *
 * Company rule: one report = one calendar month (monthly import). A month is
 * normally complete; it may be partial when Claude has no data for some of
 * its days (e.g. the first month of data, Jul 2–31). The single exception is
 * a historical multi-month report, stored as one aggregate period and never
 * split into months or days.
 */

export type ClaudeImportType = "monthly" | "historical";

/** Inclusive calendar-day span, YYYY-MM-DD. */
export interface ClaudePeriodSpan {
	periodStart: string;
	periodEnd: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const FILE_PERIOD_RE = /(\d{4}-\d{2}-\d{2})[-_ ]to[-_ ](\d{4}-\d{2}-\d{2})/i;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** A real calendar day (rejects 2026-02-30). */
export function isCalendarDay(day: string): boolean {
	if (!DAY_RE.test(day)) return false;
	const [y, m, d] = day.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isReportingMonth(month: string): boolean {
	if (!MONTH_RE.test(month)) return false;
	const m = Number(month.slice(5));
	return m >= 1 && m <= 12;
}

/** Period from the original Claude export file name; null when it carries none. */
export function parseFilePeriod(fileName: string): ClaudePeriodSpan | null {
	const match = FILE_PERIOD_RE.exec(fileName);
	if (!match) return null;
	return { periodStart: match[1], periodEnd: match[2] };
}

export function monthKey(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}`;
}

/** First and last calendar day of a YYYY-MM month. */
export function monthSpan(month: string): ClaudePeriodSpan {
	const [y, m] = month.split("-").map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { periodStart: `${month}-01`, periodEnd: `${month}-${String(last).padStart(2, "0")}` };
}

/** The YYYY-MM month a span covers exactly (first → last day), or null. */
export function exactMonthOf(span: ClaudePeriodSpan): string | null {
	const month = span.periodStart.slice(0, 7);
	const full = monthSpan(month);
	return full.periodStart === span.periodStart && full.periodEnd === span.periodEnd ? month : null;
}

/** "October 2026" */
export function formatMonth(month: string): string {
	const [y, m] = month.split("-").map(Number);
	return `${MONTHS[m - 1]} ${y}`;
}

/** "Oct 2026" */
export function formatMonthShort(month: string): string {
	const [y, m] = month.split("-").map(Number);
	return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "2 Oct 2026" */
export function formatDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "September 1–30, 2026" / "Jul 2 – Sep 30, 2026" / "Dec 15, 2025 – Jan 31, 2026" */
export function formatSpan(span: ClaudePeriodSpan): string {
	const [ys, ms, ds] = span.periodStart.split("-").map(Number);
	const [ye, me, de] = span.periodEnd.split("-").map(Number);
	if (ys === ye && ms === me) return `${MONTHS[ms - 1]} ${ds}–${de}, ${ys}`;
	if (ys === ye) return `${MONTHS_SHORT[ms - 1]} ${ds} – ${MONTHS_SHORT[me - 1]} ${de}, ${ys}`;
	return `${MONTHS_SHORT[ms - 1]} ${ds}, ${ys} – ${MONTHS_SHORT[me - 1]} ${de}, ${ye}`;
}

/** "Jul 2–31" / "Jul 2 – Aug 3" — a span without the year. */
export function formatSpanShort(span: ClaudePeriodSpan): string {
	const [, ms, ds] = span.periodStart.split("-").map(Number);
	const [, me, de] = span.periodEnd.split("-").map(Number);
	if (ms === me) return ds === de ? `${MONTHS_SHORT[ms - 1]} ${ds}` : `${MONTHS_SHORT[ms - 1]} ${ds}–${de}`;
	return `${MONTHS_SHORT[ms - 1]} ${ds} – ${MONTHS_SHORT[me - 1]} ${de}`;
}

/** Display label of an imported period: "Oct 2026" (monthly, complete or partial) or the exact span (historical). */
export function periodLabel(p: ClaudePeriodSpan & { importType: ClaudeImportType; reportingMonth: string | null }): string {
	return p.importType === "monthly" && p.reportingMonth ? formatMonthShort(p.reportingMonth) : formatSpan(p);
}

/**
 * How much of its period a Claude report covers.
 *  - full_month:             first → last day of one calendar month
 *  - partial_month:          part of one calendar month (e.g. the first month
 *                            Claude has data for: Jul 2–31). The missing days
 *                            are simply not in the source — never estimated.
 *  - historical_multi_month: the legacy report spanning several months
 */
export type ClaudeCoverageType = "full_month" | "partial_month" | "historical_multi_month";

/** The stored coverage type, or the one a period's dates imply. */
export function coverageTypeOf(p: ClaudePeriodSpan & { importType: ClaudeImportType; coverageType?: ClaudeCoverageType | null }): ClaudeCoverageType {
	if (p.coverageType) return p.coverageType;
	if (p.importType === "historical") return "historical_multi_month";
	return exactMonthOf(p) ? "full_month" : "partial_month";
}

/** "Complete" / "Partial · Jul 2–31" / "Historical". */
export function coverageLabel(p: ClaudePeriodSpan & { importType: ClaudeImportType; coverageType?: ClaudeCoverageType | null }): string {
	const type = coverageTypeOf(p);
	return type === "full_month" ? "Complete" : type === "partial_month" ? `Partial · ${formatSpanShort(p)}` : "Historical";
}

/** Days of the calendar month a single-month span does not cover, e.g. "July 1" or "July 1–3 and July 31". */
export function missingDays(span: ClaudePeriodSpan): { text: string; count: number } | null {
	const month = span.periodStart.slice(0, 7);
	const full = monthSpan(month);
	const name = MONTHS[Number(month.slice(5)) - 1];
	const day = (d: string) => Number(d.slice(8));
	const gaps: Array<[number, number]> = [];
	if (span.periodStart > full.periodStart) gaps.push([1, day(span.periodStart) - 1]);
	if (span.periodEnd < full.periodEnd) gaps.push([day(span.periodEnd) + 1, day(full.periodEnd)]);
	if (gaps.length === 0) return null;
	return {
		text: gaps.map(([a, b]) => (a === b ? `${name} ${a}` : `${name} ${a}–${b}`)).join(" and "),
		count: gaps.reduce((n, [a, b]) => n + b - a + 1, 0),
	};
}

export interface PeriodWarning {
	title: string;
	message: string;
}

/** Shown before a partial-month import; the import may proceed. */
export function partialMonthWarning(span: ClaudePeriodSpan): PeriodWarning {
	const missing = missingDays(span);
	return {
		title: "Partial month coverage",
		message: [
			`This Claude report covers ${formatSpan(span)}.`,
			missing ? `${missing.text} ${missing.count === 1 ? "is" : "are"} not included in the source report.` : "",
			"The available usage will be imported without estimating the missing period.",
		]
			.filter(Boolean)
			.join("\n"),
	};
}

/** Storage key: at most one active import per key (one per month; one per exact historical span). */
export function periodKey(importType: ClaudeImportType, span: ClaudePeriodSpan): string {
	return importType === "monthly" ? `monthly:${span.periodStart.slice(0, 7)}` : `historical:${span.periodStart}:${span.periodEnd}`;
}

export function spansOverlap(a: ClaudePeriodSpan, b: ClaudePeriodSpan): boolean {
	return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;
}

/** Number of calendar months a span touches (Jul 2 – Sep 30 → 3). */
export function monthsTouched(span: ClaudePeriodSpan): number {
	const [ys, ms] = span.periodStart.split("-").map(Number);
	const [ye, me] = span.periodEnd.split("-").map(Number);
	return (ye - ys) * 12 + (me - ms) + 1;
}

export interface PeriodCheck {
	ok: boolean;
	/** Resolved period (from the file name) when it could be read. */
	span: ClaudePeriodSpan | null;
	/** The month a monthly import is stored under. */
	reportingMonth: string | null;
	/** Set when `ok`. */
	coverageType: ClaudeCoverageType | null;
	/** Non-blocking notices (partial month coverage). */
	warnings: PeriodWarning[];
	error: string | null;
}

/**
 * Validates the file's period against the import the user chose.
 *
 * Monthly: the whole file period must lie in one calendar month, and that
 * month must be the selected Reporting Month — a different month or a
 * multi-month file is blocked with no override. Day 1 → last day is a
 * full_month; anything shorter is a partial_month (allowed, with a warning;
 * the missing days are never estimated). Historical: the file must span more
 * than one month; it is stored as that exact span.
 *
 * `today` (YYYY-MM-DD) blocks periods that have not finished yet.
 */
export function checkPeriod(input: {
	importType: ClaudeImportType;
	fileName: string;
	/** YYYY-MM, monthly imports only. */
	selectedMonth: string | null;
	today: string;
}): PeriodCheck {
	const fail = (error: string, span: ClaudePeriodSpan | null = null): PeriodCheck => ({ ok: false, span, reportingMonth: null, coverageType: null, warnings: [], error });

	const span = parseFilePeriod(input.fileName);
	if (!span) {
		return fail(
			"The reporting period could not be read from the file name. Upload the original Claude export (its name ends in …-YYYY-MM-DD-to-YYYY-MM-DD.csv) without renaming it.",
		);
	}
	if (!isCalendarDay(span.periodStart) || !isCalendarDay(span.periodEnd)) return fail("The file name contains an invalid date.", span);
	if (span.periodStart > span.periodEnd) return fail("The file name's period ends before it starts.", span);
	// Shape problems first (they are the actionable ones), then an unfinished period.
	const unfinished = () =>
		span.periodEnd > input.today
			? fail(`This report runs until ${formatDay(span.periodEnd)}, which has not finished yet. Export the report after the period ends.`, span)
			: null;

	if (input.importType === "monthly") {
		if (!input.selectedMonth || !isReportingMonth(input.selectedMonth)) return fail("Select the reporting month.", span);
		const selected = formatMonth(input.selectedMonth);
		if (monthsTouched(span) > 1) {
			return fail(
				`This Claude report covers more than one month, so it cannot be a monthly import.\n\nSelected: ${selected}\nFile period: ${formatSpan(span)}\nA multi-month report can only be imported as a Historical / Multi-month Report.`,
				span,
			);
		}
		if (span.periodStart.slice(0, 7) !== input.selectedMonth) {
			return fail(`Selected reporting month does not match this Claude report.\n\nSelected: ${selected}\nFile period: ${formatSpan(span)}`, span);
		}
		const full = exactMonthOf(span) === input.selectedMonth;
		return (
			unfinished() ?? {
				ok: true,
				span,
				reportingMonth: input.selectedMonth,
				coverageType: full ? "full_month" : "partial_month",
				warnings: full ? [] : [partialMonthWarning(span)],
				error: null,
			}
		);
	}

	if (monthsTouched(span) < 2) {
		const month = formatMonth(span.periodStart.slice(0, 7));
		return fail(`This file covers a single month (${formatSpan(span)}). Import it as a Monthly Report for ${month} instead.`, span);
	}
	return unfinished() ?? { ok: true, span, reportingMonth: null, coverageType: "historical_multi_month", warnings: [], error: null };
}

/** YYYY-MM-DD of an instant in UTC. */
export function utcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}
