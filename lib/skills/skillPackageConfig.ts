// File: lib/skills/skillPackageConfig.ts
//
// Configurable safety limits for `.skill` package imports. Overridable via env
// so operators can tighten/loosen limits without a code change.

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SKILL_PACKAGE_LIMITS = {
	/** Max size of the uploaded .skill archive itself. */
	maxArchiveBytes: envInt("SKILL_PACKAGE_MAX_ARCHIVE_BYTES", 25 * 1024 * 1024),
	/** Max total size of all files once decompressed. */
	maxExtractedBytes: envInt("SKILL_PACKAGE_MAX_EXTRACTED_BYTES", 100 * 1024 * 1024),
	/** Max number of safe file entries in the package. */
	maxFileCount: envInt("SKILL_PACKAGE_MAX_FILE_COUNT", 500),
	/** Max size of any single file inside the package. */
	maxFileBytes: envInt("SKILL_PACKAGE_MAX_FILE_BYTES", 25 * 1024 * 1024),
	/** Max size of manifest.json specifically (small structured metadata, not a data file). */
	maxManifestBytes: envInt("SKILL_PACKAGE_MAX_MANIFEST_BYTES", 256 * 1024),
	/** Max size of SKILL.md specifically (instructions text, not a data file). */
	maxSkillMdBytes: envInt("SKILL_PACKAGE_MAX_SKILL_MD_BYTES", 1024 * 1024),
	/** Max length of any single normalized path inside the package. */
	maxPathLength: envInt("SKILL_PACKAGE_MAX_PATH_LENGTH", 400),
};
