// File: lib/skills/skillPackageErrors.ts
//
// Structured, client-safe errors for the `.skill` package import pipeline.
// Never carry local paths, OSS credentials, or stack traces in `message`.

export type SkillImportErrorCode =
	| "UNSUPPORTED_FILE_TYPE"
	| "INVALID_SKILL_ARCHIVE"
	| "SKILL_PACKAGE_MISSING_ENTRYPOINT"
	| "SKILL_PACKAGE_MULTIPLE_ENTRYPOINTS"
	| "INVALID_SKILL_FRONTMATTER"
	| "EMPTY_SKILL_INSTRUCTIONS"
	| "UNSAFE_ARCHIVE_PATH"
	| "DUPLICATE_ARCHIVE_PATH"
	| "SKILL_PACKAGE_TOO_LARGE"
	| "SKILL_PACKAGE_TOO_MANY_FILES"
	| "SKILL_FILE_TOO_LARGE"
	| "SKILL_MANIFEST_TOO_LARGE"
	| "SKILL_MD_TOO_LARGE"
	| "INVALID_SKILL_MANIFEST"
	| "SKILL_MANIFEST_INVALID_PATH"
	| "SKILL_MANIFEST_MISSING_FILE"
	| "OSS_UPLOAD_FAILED"
	| "SKILL_DATABASE_SAVE_FAILED"
	| "SKILL_IMPORT_ROLLBACK_FAILED";

export class SkillImportError extends Error {
	readonly code: SkillImportErrorCode;

	constructor(code: SkillImportErrorCode, message: string) {
		super(message);
		this.name = "SkillImportError";
		this.code = code;
	}
}

const CLIENT_ERROR_CODES: ReadonlySet<SkillImportErrorCode> = new Set([
	"UNSUPPORTED_FILE_TYPE",
	"INVALID_SKILL_ARCHIVE",
	"SKILL_PACKAGE_MISSING_ENTRYPOINT",
	"SKILL_PACKAGE_MULTIPLE_ENTRYPOINTS",
	"INVALID_SKILL_FRONTMATTER",
	"EMPTY_SKILL_INSTRUCTIONS",
	"UNSAFE_ARCHIVE_PATH",
	"DUPLICATE_ARCHIVE_PATH",
	"SKILL_PACKAGE_TOO_MANY_FILES",
	"SKILL_FILE_TOO_LARGE",
	"SKILL_MANIFEST_TOO_LARGE",
	"SKILL_MD_TOO_LARGE",
	"INVALID_SKILL_MANIFEST",
	"SKILL_MANIFEST_INVALID_PATH",
	"SKILL_MANIFEST_MISSING_FILE",
]);

/** HTTP status to use when surfacing a SkillImportError from a route handler. */
export function skillImportErrorStatus(code: SkillImportErrorCode): number {
	if (code === "SKILL_PACKAGE_TOO_LARGE") return 413;
	if (CLIENT_ERROR_CODES.has(code)) return 400;
	return 500;
}

export function skillImportErrorResponseBody(err: SkillImportError) {
	return { success: false as const, code: err.code, message: err.message };
}
