/**
 * The one department normalization rule for Workspace. Every department name that
 * enters the app (MS365 login sync, per-department sync) is passed through
 * canonicalDepartmentName before it is looked up, created or assigned, so a
 * legacy name can never recreate its old sch_dept_mapping row. Readers that
 * see stored history (AI Usage records keep the name they were saved with)
 * map legacy names through the same table at read time.
 *
 * Pure and dependency-free: imported by client components (AI Usage filters)
 * and the server alike. Add a mapping here — and nowhere else — then migrate
 * the stored references with scripts/departments/normalize-departments.ts.
 */

/** Legacy MS365 department name → the canonical department that replaced it. */
export const DEPARTMENT_ALIASES: Readonly<Record<string, string>> = {
	"VN-HCM-Mechanical and Electrical-Studio5": "VN-HCM-Mechanical and Electrical-ME005",
	"VN-HCM-Civil and Structure-Studio2": "VN-HCM-Civil and Structure-CS002",
	"VN-HCM-Architecture-AR028": "VN-HCM-Architecture-AR053",
};

/** Whitespace- and case-insensitive key, so "  vn-hcm-…-ar028 " still maps. */
const aliasKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const CANONICAL_BY_KEY = new Map(Object.entries(DEPARTMENT_ALIASES).map(([legacy, canonical]) => [aliasKey(legacy), canonical]));

/**
 * The canonical name of a department. Idempotent: a canonical (or unmapped)
 * name is returned unchanged, so re-normalizing never rewrites a record.
 */
export function canonicalDepartmentName(name: string): string {
	return CANONICAL_BY_KEY.get(aliasKey(name)) ?? name;
}

/** canonicalDepartmentName for optional values (MS365 fields may be null). */
export function canonicalDepartmentNameOrNull(name: string | null | undefined): string | null {
	const trimmed = name?.trim();
	return trimmed ? canonicalDepartmentName(trimmed) : null;
}

/** The stored names a canonical department covers: itself plus its legacy names. */
export function departmentNameVariants(canonical: string): string[] {
	return [canonical, ...Object.keys(DEPARTMENT_ALIASES).filter((legacy) => DEPARTMENT_ALIASES[legacy] === canonical)];
}

/** A legacy name, merged into another department — never selectable or configurable. */
export function isLegacyDepartmentName(name: string | null | undefined): boolean {
	return typeof name === "string" && CANONICAL_BY_KEY.has(aliasKey(name));
}

/** The error for configuring a legacy department, or null when the name is canonical. */
export function legacyDepartmentError(name: string | null | undefined): string | null {
	if (!isLegacyDepartmentName(name)) return null;
	return `"${name}" was merged into "${canonicalDepartmentName(name!)}" — use that department instead.`;
}
