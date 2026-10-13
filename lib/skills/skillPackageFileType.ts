// File: lib/skills/skillPackageFileType.ts
//
// Pure extension → mime-type / display-kind mapping shared by the server (OSS
// Content-Type headers) and the client (Package Contents badges). Never used to
// change where a file is stored — only its Content-Type and its UI badge.
import type { SkillPackageFileKind } from "@/types/skill-library.types";

const MIME_BY_EXTENSION: Record<string, string> = {
	md: "text/markdown",
	txt: "text/plain",
	json: "application/json",
	yml: "application/yaml",
	yaml: "application/yaml",
	py: "text/x-python",
	ts: "text/typescript",
	tsx: "text/typescript",
	js: "text/javascript",
	jsx: "text/javascript",
	sh: "application/x-sh",
	ps1: "application/x-powershell",
	css: "text/css",
	html: "text/html",
	csv: "text/csv",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	xls: "application/vnd.ms-excel",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
};

function getExtension(relativePath: string): string {
	const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1);
	const dot = basename.lastIndexOf(".");
	return dot === -1 ? "" : basename.slice(dot + 1).toLowerCase();
}

export function inferMimeType(relativePath: string): string | null {
	return MIME_BY_EXTENSION[getExtension(relativePath)] ?? null;
}

/** UI-only badge classification. Never affects the OSS object key or storage layout. */
export function classifyPackageFileKind(relativePath: string): SkillPackageFileKind {
	if (relativePath === "SKILL.md") return "skill";
	const ext = getExtension(relativePath);
	switch (ext) {
		case "md":
			return "markdown";
		case "py":
			return "python";
		case "ts":
		case "tsx":
			return "typescript";
		case "json":
			return "json";
		case "yml":
		case "yaml":
			return "yaml";
		case "xlsx":
		case "xls":
		case "csv":
			return "excel";
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "svg":
		case "webp":
			return "image";
		case "js":
		case "jsx":
		case "sh":
		case "ps1":
		case "pdf":
		case "docx":
		case "zip":
			return "binary";
		default:
			return ext ? "other" : "binary";
	}
}
