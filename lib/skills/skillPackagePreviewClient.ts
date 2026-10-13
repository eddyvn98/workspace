// File: lib/skills/skillPackagePreviewClient.ts
//
// Browser-only, best-effort preview of a `.skill` archive before it's uploaded.
// Mirrors the server's extraction/validation rules closely enough to give the user
// an accurate preview and fail fast on obvious problems, but the server
// (skillPackageImport.server.ts) remains the sole source of truth — this module
// never uploads anything and its "valid" flag is advisory only.
//
// Deliberately does NOT reuse extractSkillPackage() from skillPackageArchive.ts:
// that function reads file bytes via JSZip's "nodebuffer" mode, which needs Node's
// Buffer and isn't meant to run in the browser. It does reuse normalizeEntryPath()
// (pure string logic, no Buffer) so path-safety rules stay identical in both places.
import JSZip from "jszip";
import { normalizeEntryPath } from "@/lib/skills/skillPackageArchive";
import { classifyPackageFileKind } from "@/lib/skills/skillPackageFileType";
import { parseSkillMdStrict } from "@/lib/skill-md-utils";
import { classifyPackageResources, parseSkillManifest, type ParsedSkillManifest } from "@/lib/skills/skillPackageManifest";
import { SkillImportError } from "@/lib/skills/skillPackageErrors";
import { SKILL_PACKAGE_LIMITS } from "@/lib/skills/skillPackageConfig";
import type { SkillPackageFileKind } from "@/types/skill-library.types";

export interface SkillImportPreviewFile {
	path: string;
	kind: SkillPackageFileKind;
	sizeBytes: number | null;
}

export interface SkillImportPreview {
	valid: boolean;
	errors: string[];
	warnings: string[];
	name: string | null;
	description: string | null;
	packageRoot: string;
	hasSkillMd: boolean;
	hasManifest: boolean;
	references: SkillImportPreviewFile[];
	scripts: SkillImportPreviewFile[];
	assets: SkillImportPreviewFile[];
	templates: SkillImportPreviewFile[];
	otherFiles: SkillImportPreviewFile[];
	totalFileCount: number;
	totalExtractedBytes: number;
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

function emptyPreview(errors: string[]): SkillImportPreview {
	return {
		valid: false,
		errors,
		warnings: [],
		name: null,
		description: null,
		packageRoot: "",
		hasSkillMd: false,
		hasManifest: false,
		references: [],
		scripts: [],
		assets: [],
		templates: [],
		otherFiles: [],
		totalFileCount: 0,
		totalExtractedBytes: 0,
	};
}

interface RawEntry {
	dir: boolean;
	async(type: "string"): Promise<string>;
	_data?: { uncompressedSize?: number };
}

export async function buildSkillImportPreview(file: File): Promise<SkillImportPreview> {
	let zip: JSZip;
	try {
		// Read to an ArrayBuffer ourselves rather than handing JSZip the raw File —
		// JSZip's own File/Blob detection isn't consistent across every JS runtime,
		// while `File#arrayBuffer()` is a standard method everywhere the File API exists.
		const buffer = await file.arrayBuffer();
		zip = await JSZip.loadAsync(buffer);
	} catch {
		return emptyPreview(["The selected file is not a valid ZIP-compatible archive."]);
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	interface Candidate {
		normalizedPath: string;
		entry: RawEntry;
	}
	const candidates: Candidate[] = [];
	const seen = new Set<string>();

	for (const [rawName, entry] of Object.entries(zip.files) as [string, RawEntry][]) {
		if (entry.dir) continue;

		let normalizedPath: string;
		try {
			normalizedPath = normalizeEntryPath(rawName);
		} catch (err) {
			errors.push(errorMessage(err, `Unsafe archive entry: ${rawName}`));
			continue;
		}

		const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
		if (normalizedPath.toLowerCase().startsWith("__macosx/") || [".ds_store", "thumbs.db"].includes(basename.toLowerCase())) {
			continue;
		}

		const key = normalizedPath.toLowerCase();
		if (seen.has(key)) {
			errors.push(`Archive contains duplicate path: ${normalizedPath}`);
			continue;
		}
		seen.add(key);
		candidates.push({ normalizedPath, entry });
	}

	if (candidates.length > SKILL_PACKAGE_LIMITS.maxFileCount) {
		errors.push(`Package contains ${candidates.length} files, exceeding the limit of ${SKILL_PACKAGE_LIMITS.maxFileCount}.`);
	}

	const skillMdCandidates = candidates.filter((c) => /^skill\.md$/i.test(c.normalizedPath.split("/").pop() ?? ""));
	if (skillMdCandidates.length === 0) {
		errors.push("The package does not contain a SKILL.md file at its root.");
		return { ...emptyPreview(errors), totalFileCount: candidates.length };
	}
	if (skillMdCandidates.length > 1) {
		errors.push(`The package contains ${skillMdCandidates.length} SKILL.md files; exactly one is required.`);
		return { ...emptyPreview(errors), totalFileCount: candidates.length };
	}

	const entryPath = skillMdCandidates[0].normalizedPath;
	const lastSlash = entryPath.lastIndexOf("/");
	const packageRoot = lastSlash === -1 ? "" : entryPath.slice(0, lastSlash);
	const rootPrefix = packageRoot === "" ? "" : `${packageRoot}/`;
	const inRoot = candidates.filter((c) => (rootPrefix === "" ? true : c.normalizedPath.startsWith(rootPrefix)));

	interface Prepared {
		relativePath: string;
		size: number;
		entry: RawEntry;
	}
	const prepared: Prepared[] = [];
	let totalExtractedBytes = 0;
	for (const c of inRoot) {
		const relativePath = rootPrefix === "" ? c.normalizedPath : c.normalizedPath.slice(rootPrefix.length);
		if (!relativePath) continue;
		const size = typeof c.entry._data?.uncompressedSize === "number" ? c.entry._data.uncompressedSize : 0;
		totalExtractedBytes += size;
		prepared.push({ relativePath, size, entry: c.entry });
	}

	if (totalExtractedBytes > SKILL_PACKAGE_LIMITS.maxExtractedBytes) {
		errors.push(`Package's total extracted size (~${totalExtractedBytes.toLocaleString()} bytes) exceeds the limit of ${SKILL_PACKAGE_LIMITS.maxExtractedBytes.toLocaleString()} bytes.`);
	}

	const skillMdEntry = prepared.find((p) => p.relativePath === "SKILL.md");
	let name: string | null = null;
	let description: string | null = null;
	if (skillMdEntry) {
		try {
			const content = await skillMdEntry.entry.async("string");
			const parsed = parseSkillMdStrict(content);
			name = parsed.title;
			description = parsed.description;
		} catch (err) {
			errors.push(errorMessage(err, "SKILL.md is invalid."));
		}
	}

	const manifestEntry = prepared.find((p) => p.relativePath === "manifest.json");
	let declaredManifest: ParsedSkillManifest | null = null;
	if (manifestEntry) {
		try {
			const content = await manifestEntry.entry.async("string");
			const availablePaths = new Set(prepared.map((p) => p.relativePath));
			declaredManifest = parseSkillManifest(content, availablePaths);
		} catch (err) {
			errors.push(err instanceof SkillImportError ? err.message : errorMessage(err, "manifest.json is invalid."));
		}
	}

	const classified = classifyPackageResources(
		prepared.map((p) => ({ relativePath: p.relativePath, size: p.size })),
		declaredManifest,
	);
	warnings.push(...classified.warnings);

	const toPreviewFile = (path: string, size: number | null): SkillImportPreviewFile => ({
		path,
		kind: classifyPackageFileKind(path),
		sizeBytes: size,
	});

	const categorizedPaths = new Set([
		...classified.references.map((r) => r.path),
		...classified.scripts.map((s) => s.path),
		...classified.assets.map((a) => a.path),
		...classified.templates.map((t) => t.path),
	]);
	const otherFiles = prepared.filter(
		(p) => p.relativePath !== "SKILL.md" && p.relativePath !== "manifest.json" && !categorizedPaths.has(p.relativePath) && !p.relativePath.startsWith(".package/"),
	);

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		name,
		description,
		packageRoot,
		hasSkillMd: true,
		hasManifest: Boolean(manifestEntry),
		references: classified.references.map((r) => toPreviewFile(r.path, r.sizeBytes ?? null)),
		scripts: classified.scripts.map((s) => toPreviewFile(s.path, s.sizeBytes ?? null)),
		assets: classified.assets.map((a) => toPreviewFile(a.path, a.sizeBytes ?? null)),
		templates: classified.templates.map((t) => toPreviewFile(t.path, null)),
		otherFiles: otherFiles.map((p) => toPreviewFile(p.relativePath, p.size)),
		totalFileCount: prepared.length,
		totalExtractedBytes,
	};
}
