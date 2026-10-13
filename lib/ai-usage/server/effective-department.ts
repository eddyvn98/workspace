/**
 * Read-time department fallback shared by Website, Claude and Gemini reporting.
 * Saved department fields remain authoritative and no stored record is changed.
 */
import type { Collection, Document } from "mongodb";
import { isUnassignedDepartment } from "../constants";
import { lookupDepartments, type DepartmentInfo } from "./department-lookup";

export interface EffectiveDepartment {
	departmentId: string | null;
	departmentName: string | null;
}

const normalize = (identity: string) => identity.trim().toLowerCase();
const validName = (name: string | null | undefined) => !isUnassignedDepartment(null, name);

/** Exact saved value wins. An unresolved value uses the current directory. */
export function resolveEffectiveDepartment(
	saved: EffectiveDepartment,
	directory: EffectiveDepartment | null | undefined,
): EffectiveDepartment {
	if (validName(saved.departmentName)) return saved;
	if (directory && validName(directory.departmentName)) return directory;
	return { departmentId: null, departmentName: null };
}

const CACHE_MS = 30_000;
const identitiesCache = new Map<string, { at: number; value: Promise<Map<string, DepartmentInfo>> }>();

async function currentDepartments<T extends Document>(collection: Collection<T>, identityField: string): Promise<Map<string, DepartmentInfo>> {
	const key = `${collection.dbName}.${collection.collectionName}:${identityField}`;
	const cached = identitiesCache.get(key);
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
	const value = (async () => {
		const identities = (await collection.distinct(identityField))
			.filter((v) => typeof v === "string")
			.map((v) => normalize(String(v))).filter(Boolean);
		return lookupDepartments(identities);
	})();
	const entry = { at: Date.now(), value };
	identitiesCache.set(key, entry);
	value.catch(() => { if (identitiesCache.get(key) === entry) identitiesCache.delete(key); });
	return value;
}

/**
 * Produce aggregation stages before any department filter/grouping. All report
 * paths then consume the same effective departmentId/departmentName fields.
 * The stages touch only the aggregation stream, not MongoDB documents.
 */
export async function effectiveDepartmentStages<T extends Document>(collection: Collection<T>, identityField: string): Promise<Record<string, unknown>[]> {
	const directory = await currentDepartments(collection, identityField);
	const identity = { $toLower: { $trim: { input: { $ifNull: [`$${identityField}`, ""] } } } };
	const branches = [...directory.entries()]
		.filter(([, info]) => validName(info.departmentName))
		.map(([email, info]) => ({
			case: { $eq: [identity, email] },
			then: { $literal: { departmentId: info.departmentId, departmentName: info.departmentName } },
		}));
	const savedName = { $trim: { input: { $ifNull: ["$departmentName", ""] } } };
	const savedValid = { $and: [{ $ne: [savedName, ""] }, { $ne: [{ $toLower: savedName }, "unassigned"] }] };
	return [
		{ $set: { __effectiveDirectoryDepartment: branches.length ? { $switch: { branches, default: null } } : null } },
		{ $set: {
			departmentId: { $cond: [savedValid, "$departmentId", { $ifNull: ["$__effectiveDirectoryDepartment.departmentId", null] }] },
			departmentName: { $cond: [savedValid, "$departmentName", { $ifNull: ["$__effectiveDirectoryDepartment.departmentName", null] }] },
		} },
		{ $unset: "__effectiveDirectoryDepartment" },
	];
}
