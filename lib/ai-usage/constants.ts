import type { DatePreset, UsagePlatform } from "./types";
import { DEPARTMENT_ALIASES, canonicalDepartmentName, departmentNameVariants } from "@/lib/departments/canonical";

/** Platform options, in display order (exact labels). */
export const PLATFORMS: UsagePlatform[] = ["all", "website", "desktop", "claude", "gemini"];

/** A future platform (e.g. ChatGPT) adds its key to UsagePlatform and an entry here. */
export const PLATFORM_LABEL: Record<UsagePlatform, string> = {
	all: "All Platforms",
	website: "Workspace Website",
	desktop: "Workspace Desktop",
	claude: "Claude",
	gemini: "Gemini",
};

/** Neutral app icon used in usage summaries. */
const ICON_WORKSPACE = "/workspace-mark.svg";

/**
 * Where a platform's icon comes from: a public asset path, or a brand icon
 * the app already ships in lib/ai-models.tsx (resolved by the filter bar, so
 * this file stays free of JSX for its server-side importers).
 */
export type PlatformIcon = { asset: string } | { brand: "claude" | "gemini" };

/**
 * Product icon per platform; null = text only. An aggregate like All
 * Platforms has no product, so it has no icon. A future platform (e.g.
 * ChatGPT) adds its own entry here.
 */
export const PLATFORM_ICON: Record<UsagePlatform, PlatformIcon | null> = {
	all: null,
	website: { asset: ICON_WORKSPACE },
	desktop: { asset: ICON_WORKSPACE },
	claude: { brand: "claude" },
	gemini: { brand: "gemini" },
};

export function isUsagePlatform(value: unknown): value is UsagePlatform {
	return typeof value === "string" && (PLATFORMS as string[]).includes(value);
}

/**
 * Display names for the Workspace category keys the backend stores (the
 * x-category / Dify app key identity). Names come from the existing source:
 * lib/category-suggestions.tsx titles, the tools config and the chat
 * surfaces. Unknown keys fall back to the raw key, so a new category shows up
 * without a code change.
 */
const CATEGORY_LABELS: Record<string, string> = {
	CHAT_KEY: "General Chat",
	ACADEMY_CHAT_KEY: "AI Academy",
	IMAGE_KEY: "Image Generator",
	VIDEO_GEN_EDIT_KEY: "Video Generator",
	WORKSPACE_AGENT_CHAT_KEY: "Workspace",
	WORKSPACE_IMAGE_CAPTION_KEY: "Workspace Image Caption",
};

export function categoryLabel(category: string): string {
	if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
	return category;
}

/** Generation requests for which Dify legitimately reports 0 tokens. */
export const ZERO_TOKEN_CATEGORIES = new Set(["IMAGE_KEY", "VIDEO_GEN_EDIT_KEY"]);

/**
 * Fixed colour slot per category — colour follows the category, never its
 * rank, so filtering never repaints the survivors. Slot values live in
 * components/features/ai-usage/theme.ts. Categories beyond the eight slots
 * use the neutral colour.
 */
const CATEGORY_SLOT_ORDER = [
	"CHAT_KEY",
	"IMAGE_KEY",
	"VIDEO_GEN_EDIT_KEY",
	"WORKSPACE_AGENT_CHAT_KEY",
];

export function categoryColor(category: string): string {
	const slot = CATEGORY_SLOT_ORDER.indexOf(category);
	return slot === -1 ? "var(--ai-usage-neutral)" : `var(--ai-usage-c${slot + 1})`;
}

/** Light-mode hex of the same slots (components/features/ai-usage/theme.ts), for the Excel export. */
const CATEGORY_SLOT_HEX = ["2A78D6", "EB6834", "1BAF7A", "EDA100", "E87BA4", "008300", "4A3AA7", "E34948"];

export function categoryHex(category: string): string {
	const slot = CATEGORY_SLOT_ORDER.indexOf(category);
	return slot === -1 ? "64748B" : CATEGORY_SLOT_HEX[slot];
}

/** Stable display order: known categories first (slot order), then the rest alphabetically. */
export function compareCategories(a: string, b: string): number {
	const ia = CATEGORY_SLOT_ORDER.indexOf(a);
	const ib = CATEGORY_SLOT_ORDER.indexOf(b);
	if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
	return a.localeCompare(b);
}

/** Neutral labels for metadata the historical data may lack. */
export const UNASSIGNED_DEPARTMENT = "Unassigned";
export const UNKNOWN_MODEL = "Not recorded";

/**
 * A department is "mapped" only when it has a display name. A department id
 * without a name (the id has no sch_dept_mapping entry — a mapping failure,
 * not a department) is the same state as no department at all: both are
 * the one "Unassigned" group. `departmentId` is kept in the signature for
 * the callers; it no longer changes the label.
 */
export function departmentLabel(departmentId: string | null, departmentName: string | null): string {
	return isUnassignedDepartment(departmentId, departmentName) ? UNASSIGNED_DEPARTMENT : canonicalDepartmentName(departmentName!);
}

/**
 * Legacy department names → the department that replaced them, from the one
 * platform-wide table (lib/departments/canonical.ts). AI Usage reports the
 * legacy name as the canonical one everywhere (labels, filter options,
 * breakdowns, export); stored records keep their original names.
 */
export { DEPARTMENT_ALIASES, canonicalDepartmentName, departmentNameVariants };

/** "Unassigned" exactly as departmentLabel() shows it: no valid department name, whatever the id. */
export function isUnassignedDepartment(_departmentId: string | null | undefined, departmentName: string | null | undefined): boolean {
	return !departmentName?.trim() || departmentName.trim().toLowerCase() === "unassigned";
}

/**
 * Department filter value meaning "Unassigned" (sent in `department=` next
 * to real ids). A sentinel, never a stored department value: the API
 * matches it to records with no department, not to a department named
 * "Unassigned".
 */
export const UNASSIGNED_DEPARTMENT_FILTER = "__unassigned__";

export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
	today: "Today",
	yesterday: "Yesterday",
	last7: "Last 7 Days",
	last30: "Last 30 Days",
	thisMonth: "This Month",
	lastMonth: "Last Month",
	thisQuarter: "This Quarter",
	thisYear: "This Year",
	allTime: "All Time",
	custom: "Custom Range",
};

export const DATE_PRESETS: DatePreset[] = [
	"today",
	"yesterday",
	"last7",
	"last30",
	"thisMonth",
	"lastMonth",
	"thisQuarter",
	"thisYear",
	"allTime",
	"custom",
];
