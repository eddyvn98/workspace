// File: lib/skills/skillPackageManifest.ts
//
// Pure, environment-agnostic parsing of a `.skill` package's optional, user-authored
// `manifest.json` (declares references/scripts/assets roles), plus classification of
// every extracted file into references/scripts/assets/templates. No OSS, no auth, no
// fs — safe to import from both the server import pipeline and the browser import
// preview, and independently unit-testable.
import { SkillImportError } from "@/lib/skills/skillPackageErrors";
import { inferMimeType } from "@/lib/skills/skillPackageFileType";
import type { SkillAsset, SkillReference, SkillScript, SkillTemplate } from "@/types/skill-library.types";

export interface DeclaredReference {
	path: string;
	includeInContext?: boolean;
}
export interface DeclaredScript {
	path: string;
}
export interface DeclaredAsset {
	path: string;
	role?: string;
	format?: string;
	label?: string;
}

export interface ParsedSkillManifest {
	references: DeclaredReference[];
	scripts: DeclaredScript[];
	assets: DeclaredAsset[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalizes a manifest array entry that may be a bare path string or an object with `path`. */
function normalizeEntries(raw: unknown, field: string): Record<string, unknown>[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		throw new SkillImportError("INVALID_SKILL_MANIFEST", `manifest.json "${field}" must be an array.`);
	}
	return raw.map((entry) => {
		if (typeof entry === "string") return { path: entry };
		if (isPlainObject(entry) && typeof entry.path === "string") return entry;
		throw new SkillImportError("INVALID_SKILL_MANIFEST", `manifest.json "${field}" entries must be a path string or an object with a "path" field.`);
	});
}

function requirePathUnderFolder(path: string, folder: string, availablePaths: ReadonlySet<string>): void {
	if (!path.startsWith(folder)) {
		throw new SkillImportError("SKILL_MANIFEST_INVALID_PATH", `manifest.json declares "${path}", which must live under "${folder}".`);
	}
	if (!availablePaths.has(path)) {
		throw new SkillImportError("SKILL_MANIFEST_MISSING_FILE", `manifest.json declares "${path}", but that file is not present in the package.`);
	}
}

function dedupeByPath<T extends { path: string }>(entries: T[]): T[] {
	const seen = new Map<string, T>();
	for (const entry of entries) {
		if (!seen.has(entry.path)) seen.set(entry.path, entry);
	}
	return [...seen.values()];
}

/**
 * Parses and validates a package's `manifest.json`. `availablePaths` must be the set
 * of every safe, already-extracted relative path in the package (SKILL.md included),
 * so declared entries can be confirmed to actually exist. Unsupported/unknown fields
 * on the root object or on individual entries are ignored rather than rejected.
 */
export function parseSkillManifest(raw: string, availablePaths: ReadonlySet<string>): ParsedSkillManifest {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new SkillImportError("INVALID_SKILL_MANIFEST", "manifest.json is not valid JSON.");
	}
	if (!isPlainObject(json)) {
		throw new SkillImportError("INVALID_SKILL_MANIFEST", "manifest.json must contain a JSON object at its root.");
	}

	if (json.entrypoint !== undefined && json.entrypoint !== "SKILL.md") {
		throw new SkillImportError("INVALID_SKILL_MANIFEST", `manifest.json "entrypoint" must be "SKILL.md" (got ${JSON.stringify(json.entrypoint)}).`);
	}

	const references = dedupeByPath(
		normalizeEntries(json.references, "references").map((entry): DeclaredReference => {
			const path = entry.path as string;
			requirePathUnderFolder(path, "references/", availablePaths);
			const includeInContext = entry.include_in_context ?? entry.includeInContext;
			return { path, includeInContext: typeof includeInContext === "boolean" ? includeInContext : undefined };
		}),
	);

	const scripts = dedupeByPath(
		normalizeEntries(json.scripts, "scripts").map((entry): DeclaredScript => {
			const path = entry.path as string;
			requirePathUnderFolder(path, "scripts/", availablePaths);
			return { path };
		}),
	);

	const assets = dedupeByPath(
		normalizeEntries(json.assets, "assets").map((entry): DeclaredAsset => {
			const path = entry.path as string;
			requirePathUnderFolder(path, "assets/", availablePaths);
			return {
				path,
				role: typeof entry.role === "string" ? entry.role : undefined,
				format: typeof entry.format === "string" ? entry.format : undefined,
				label: typeof entry.label === "string" ? entry.label : undefined,
			};
		}),
	);

	return { references, scripts, assets };
}

export interface ClassifiableFile {
	relativePath: string;
	size: number;
}

export interface ClassifiedPackageResources {
	references: SkillReference[];
	scripts: SkillScript[];
	assets: SkillAsset[];
	templates: SkillTemplate[];
	warnings: string[];
	hasDeclaredManifest: boolean;
}

function fileExtension(relativePath: string): string | undefined {
	const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1);
	const dot = basename.lastIndexOf(".");
	return dot === -1 ? undefined : basename.slice(dot + 1).toLowerCase();
}

/**
 * Classifies every non-entrypoint, non-internal package file into references,
 * scripts, assets, and templates (assets whose declared `role` is `"template"`).
 * Files outside `references/`, `scripts/`, and `assets/` are neither dropped nor
 * uploaded differently — they still exist in `SkillPackagePayload.files` — but are
 * called out in `warnings` since they won't appear in any category-specific view.
 */
export function classifyPackageResources(
	files: ClassifiableFile[],
	manifest: ParsedSkillManifest | null,
): ClassifiedPackageResources {
	const declaredReferenceByPath = new Map((manifest?.references ?? []).map((r) => [r.path, r]));
	const declaredAssetByPath = new Map((manifest?.assets ?? []).map((a) => [a.path, a]));

	const references: SkillReference[] = [];
	const scripts: SkillScript[] = [];
	const assets: SkillAsset[] = [];
	const templates: SkillTemplate[] = [];
	const uncategorized: string[] = [];

	for (const file of files) {
		const { relativePath, size } = file;
		if (relativePath === "SKILL.md" || relativePath === "manifest.json") continue;
		if (relativePath.startsWith(".package/")) continue;

		if (relativePath.startsWith("references/")) {
			const declared = declaredReferenceByPath.get(relativePath);
			references.push({
				path: relativePath,
				type: /\.(md|txt)$/i.test(relativePath) ? "text" : "document",
				mimeType: inferMimeType(relativePath),
				sizeBytes: size,
				includeInContext: declared?.includeInContext ?? true,
			});
			continue;
		}

		if (relativePath.startsWith("scripts/")) {
			scripts.push({
				path: relativePath,
				type: "script",
				extension: fileExtension(relativePath),
				sizeBytes: size,
			});
			continue;
		}

		if (relativePath.startsWith("assets/")) {
			const declared = declaredAssetByPath.get(relativePath);
			if (declared?.role === "template") {
				templates.push({
					path: relativePath,
					role: "template",
					format: declared.format ?? fileExtension(relativePath),
					mimeType: inferMimeType(relativePath),
					label: declared.label,
				});
			} else {
				assets.push({
					path: relativePath,
					type: "asset",
					role: declared?.role,
					format: declared?.format ?? fileExtension(relativePath),
					mimeType: inferMimeType(relativePath),
					sizeBytes: size,
				});
			}
			continue;
		}

		uncategorized.push(relativePath);
	}

	const warnings: string[] = [];
	if (uncategorized.length > 0) {
		const sample = uncategorized.slice(0, 3).join(", ");
		const more = uncategorized.length > 3 ? ` and ${uncategorized.length - 3} more` : "";
		warnings.push(
			`${uncategorized.length} file(s) are outside references/, scripts/, and assets/ and won't appear as references, scripts, or assets: ${sample}${more}.`,
		);
	}

	return { references, scripts, assets, templates, warnings, hasDeclaredManifest: manifest !== null };
}
