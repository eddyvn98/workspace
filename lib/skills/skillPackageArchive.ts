// File: lib/skills/skillPackageArchive.ts
//
// Server-only, security-hardened `.skill` (ZIP-compatible) archive extraction.
// Pure in that it only touches the buffer it's given — no OSS, no auth, no fs —
// which keeps it independently unit-testable.
import JSZip from "jszip";
import { SkillImportError } from "@/lib/skills/skillPackageErrors";
import { SKILL_PACKAGE_LIMITS } from "@/lib/skills/skillPackageConfig";

export interface ExtractedSkillFile {
	/** Path relative to the detected package root, using forward slashes. */
	relativePath: string;
	content: Buffer;
	size: number;
}

export interface ExtractedSkillPackage {
	skillMdContent: string;
	/** Safe files below the package root, SKILL.md included, sorted by relativePath. */
	files: ExtractedSkillFile[];
}

const IGNORED_BASENAMES = new Set([".ds_store", "thumbs.db"]);
const SKILL_MD_BASENAME = /^skill\.md$/i;
const DRIVE_LETTER_PATH = /^[a-zA-Z]:/;

interface RawJszipEntry {
	name: string;
	dir: boolean;
	unixPermissions: number | null;
	async(type: "nodebuffer"): Promise<Buffer>;
	async(type: "string"): Promise<string>;
	_data?: { uncompressedSize?: number };
}

function isSymlinkEntry(entry: RawJszipEntry): boolean {
	if (typeof entry.unixPermissions !== "number") return false;
	// S_IFLNK = 0xA000 — top 4 bits of the unix mode encode the file type.
	return (entry.unixPermissions & 0xf000) === 0xa000;
}

function isIgnorableArtifact(normalizedPath: string): boolean {
	if (normalizedPath.startsWith("__macosx/")) return true;
	const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
	return IGNORED_BASENAMES.has(basename.toLowerCase());
}

/**
 * Normalizes an archive entry's raw path and rejects anything unsafe: absolute
 * paths, Windows drive-letter paths, null bytes, and any path that would resolve
 * outside the archive root once `.`/`..` segments are collapsed (ZIP Slip).
 *
 * Exported for direct unit testing: JSZip's own loader already resolves `..`
 * segments before archive entries reach this module (it silently no-ops instead
 * of throwing), so a full extractSkillPackage() round-trip can't exercise the
 * traversal branch below — this function's own stricter, throwing behavior is
 * the thing that actually needs to be verified in isolation.
 */
export function normalizeEntryPath(rawPath: string): string {
	if (rawPath.includes("\0")) {
		throw new SkillImportError("UNSAFE_ARCHIVE_PATH", "Archive entry contains a null byte.");
	}

	const slashed = rawPath.replace(/\\/g, "/");

	if (slashed.startsWith("/") || DRIVE_LETTER_PATH.test(slashed)) {
		throw new SkillImportError("UNSAFE_ARCHIVE_PATH", `Archive entry has an unsafe absolute path: ${rawPath}`);
	}

	const segments = slashed.split("/").filter((seg) => seg.length > 0 && seg !== ".");
	const stack: string[] = [];
	for (const seg of segments) {
		if (seg === "..") {
			if (stack.length === 0) {
				throw new SkillImportError("UNSAFE_ARCHIVE_PATH", `Archive entry escapes the package root: ${rawPath}`);
			}
			stack.pop();
			continue;
		}
		stack.push(seg);
	}

	if (stack.length === 0) {
		throw new SkillImportError("UNSAFE_ARCHIVE_PATH", `Archive entry resolves to an empty path: ${rawPath}`);
	}

	const normalized = stack.join("/");
	if (normalized.length > SKILL_PACKAGE_LIMITS.maxPathLength) {
		throw new SkillImportError(
			"UNSAFE_ARCHIVE_PATH",
			`Archive entry path exceeds the ${SKILL_PACKAGE_LIMITS.maxPathLength}-character limit: ${normalized.slice(0, 60)}…`,
		);
	}

	return normalized;
}

function getPreDecompressionSize(entry: RawJszipEntry): number | undefined {
	return entry._data?.uncompressedSize;
}

/** SKILL.md and manifest.json are structured metadata, not data files — they get
 *  their own, much stricter byte caps instead of the general per-file limit. */
function fileByteLimitFor(relativePath: string): { limit: number; code: "SKILL_MD_TOO_LARGE" | "SKILL_MANIFEST_TOO_LARGE" | "SKILL_FILE_TOO_LARGE" } {
	if (relativePath === "SKILL.md") return { limit: SKILL_PACKAGE_LIMITS.maxSkillMdBytes, code: "SKILL_MD_TOO_LARGE" };
	if (relativePath === "manifest.json") return { limit: SKILL_PACKAGE_LIMITS.maxManifestBytes, code: "SKILL_MANIFEST_TOO_LARGE" };
	return { limit: SKILL_PACKAGE_LIMITS.maxFileBytes, code: "SKILL_FILE_TOO_LARGE" };
}

export async function extractSkillPackage(buffer: Buffer): Promise<ExtractedSkillPackage> {
	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(buffer);
	} catch {
		throw new SkillImportError("INVALID_SKILL_ARCHIVE", "The uploaded file is not a valid ZIP-compatible archive.");
	}

	const entries = Object.values(zip.files) as unknown as RawJszipEntry[];

	interface Candidate {
		normalizedPath: string;
		entry: RawJszipEntry;
	}

	const candidates: Candidate[] = [];
	const seenPaths = new Set<string>();

	for (const entry of entries) {
		if (entry.dir) continue;

		const normalizedPath = normalizeEntryPath(entry.name);
		if (isIgnorableArtifact(normalizedPath)) continue;

		if (isSymlinkEntry(entry)) {
			throw new SkillImportError("UNSAFE_ARCHIVE_PATH", `Archive entry is a symlink, which is not allowed: ${normalizedPath}`);
		}

		if (seenPaths.has(normalizedPath.toLowerCase())) {
			throw new SkillImportError("DUPLICATE_ARCHIVE_PATH", `Archive contains duplicate path: ${normalizedPath}`);
		}
		seenPaths.add(normalizedPath.toLowerCase());

		candidates.push({ normalizedPath, entry });
	}

	if (candidates.length > SKILL_PACKAGE_LIMITS.maxFileCount) {
		throw new SkillImportError(
			"SKILL_PACKAGE_TOO_MANY_FILES",
			`Package contains ${candidates.length} files, exceeding the limit of ${SKILL_PACKAGE_LIMITS.maxFileCount}.`,
		);
	}

	const skillMdCandidates = candidates.filter((c) => SKILL_MD_BASENAME.test(c.normalizedPath.split("/").pop() ?? ""));
	if (skillMdCandidates.length === 0) {
		throw new SkillImportError("SKILL_PACKAGE_MISSING_ENTRYPOINT", "The package does not contain a valid SKILL.md file.");
	}
	if (skillMdCandidates.length > 1) {
		throw new SkillImportError(
			"SKILL_PACKAGE_MULTIPLE_ENTRYPOINTS",
			`The package contains ${skillMdCandidates.length} SKILL.md files; exactly one is required.`,
		);
	}

	const entryPath = skillMdCandidates[0].normalizedPath;
	const lastSlash = entryPath.lastIndexOf("/");
	const packageRoot = lastSlash === -1 ? "" : entryPath.slice(0, lastSlash);
	const rootPrefix = packageRoot === "" ? "" : `${packageRoot}/`;

	const inRoot = candidates.filter((c) => (rootPrefix === "" ? true : c.normalizedPath.startsWith(rootPrefix)));

	let totalExtractedBytes = 0;
	const files: ExtractedSkillFile[] = [];

	for (const candidate of inRoot) {
		const relativePath = rootPrefix === "" ? candidate.normalizedPath : candidate.normalizedPath.slice(rootPrefix.length);
		if (!relativePath) continue;

		const { limit: fileLimit, code: fileLimitCode } = fileByteLimitFor(relativePath);

		const preSize = getPreDecompressionSize(candidate.entry);
		if (typeof preSize === "number") {
			if (preSize > fileLimit) {
				throw new SkillImportError(
					fileLimitCode,
					`File "${relativePath}" (${preSize} bytes) exceeds the limit of ${fileLimit} bytes.`,
				);
			}
			totalExtractedBytes += preSize;
			if (totalExtractedBytes > SKILL_PACKAGE_LIMITS.maxExtractedBytes) {
				throw new SkillImportError(
					"SKILL_PACKAGE_TOO_LARGE",
					`Package's total extracted size exceeds the limit of ${SKILL_PACKAGE_LIMITS.maxExtractedBytes} bytes.`,
				);
			}
		}

		const content = await candidate.entry.async("nodebuffer");

		if (typeof preSize !== "number") {
			totalExtractedBytes += content.length;
			if (content.length > fileLimit) {
				throw new SkillImportError(
					fileLimitCode,
					`File "${relativePath}" (${content.length} bytes) exceeds the limit of ${fileLimit} bytes.`,
				);
			}
			if (totalExtractedBytes > SKILL_PACKAGE_LIMITS.maxExtractedBytes) {
				throw new SkillImportError(
					"SKILL_PACKAGE_TOO_LARGE",
					`Package's total extracted size exceeds the limit of ${SKILL_PACKAGE_LIMITS.maxExtractedBytes} bytes.`,
				);
			}
		}

		files.push({ relativePath, content, size: content.length });
	}

	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	const skillMdFile = files.find((f) => SKILL_MD_BASENAME.test(f.relativePath) && f.relativePath === "SKILL.md");
	if (!skillMdFile) {
		// Defensive — entryPath was found relative to its own root above, so this should be unreachable.
		throw new SkillImportError("SKILL_PACKAGE_MISSING_ENTRYPOINT", "The package does not contain a valid SKILL.md file.");
	}

	return {
		skillMdContent: skillMdFile.content.toString("utf-8"),
		files,
	};
}
