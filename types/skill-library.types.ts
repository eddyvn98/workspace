export interface SkillStep {
  title: string;
  description: string;
}

export interface SkillInputField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
  required: boolean;
}

/** Display-only classification derived from a file's extension. Never affects storage. */
export type SkillPackageFileKind =
  | "skill"
  | "markdown"
  | "python"
  | "typescript"
  | "json"
  | "yaml"
  | "excel"
  | "image"
  | "binary"
  | "other";

/**
 * Metadata for one file extracted from a `.skill` package. The file's actual bytes
 * live in OSS at `objectKey` — never in the database/JSON record. `relativePath` is
 * the path as it appeared inside the package below its detected root, preserved
 * verbatim (no flattening, no re-categorization into fixed folders).
 */
export interface SkillPackageFile {
  relativePath: string;
  objectKey: string;
  mimeType: string | null;
  size: number;
}

/**
 * A `references/` file — supporting documentation the AI may read for context.
 * `includeInContext`/`extractedTextAvailable`/`truncated`/`warning` are populated
 * only when a backend (Dify / Python) has actually processed the reference; until
 * then they're left undefined rather than guessed at.
 */
export interface SkillReference {
  path: string;
  type?: "text" | "document";
  mimeType?: string | null;
  sizeBytes?: number | null;
  includeInContext?: boolean;
  extractedTextAvailable?: boolean;
  truncated?: boolean;
  warning?: string | null;
}

/** A `scripts/` file — displayed as metadata only. Never executed by this app. */
export interface SkillScript {
  path: string;
  type: "script";
  extension?: string;
  sizeBytes?: number | null;
}

/** An `assets/` file declared in `manifest.json` (or inferred from its folder). */
export interface SkillAsset {
  path: string;
  type: "asset";
  role?: string;
  format?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

/** The subset of assets whose manifest-declared `role` is `"template"`. */
export interface SkillTemplate {
  path: string;
  role: "template" | string;
  format?: string;
  mimeType?: string | null;
  label?: string;
}

export interface SkillPackagePayload {
  sourceType: "package";
  version: 1;
  /** Always "SKILL.md" — the entrypoint's path relative to the detected package root. */
  entrypointPath: "SKILL.md";
  /** OSS prefix (no trailing slash) all of this skill's package objects live under. */
  ossRoot: string;
  /** Every safe file under the package root, flat, verbatim relative paths — the
   *  authoritative list used for export/duplicate/delete. */
  files: SkillPackageFile[];
  /** `references/*` files, classified from an optional `manifest.json` declaration
   *  (falls back to folder location when undeclared). */
  references: SkillReference[];
  /** `scripts/*` files. Metadata only — scripts are never executed by this app. */
  scripts: SkillScript[];
  /** `assets/*` files not declared with `role: "template"` in `manifest.json`. */
  assets: SkillAsset[];
  /** `assets/*` files declared with `role: "template"` in `manifest.json`. */
  templates: SkillTemplate[];
  /** Non-fatal import-time notices (e.g. files outside references/scripts/assets,
   *  or manifest fields that were ignored) surfaced read-only in the Skill Details view. */
  warnings: string[];
  /** True when the package's own manifest.json declared reference/script/asset roles
   *  explicitly, rather than everything being inferred purely from folder location. */
  hasDeclaredManifest?: boolean;
}

export interface Skill {
  id: string;
  title: string;
  description: string;
  category: string;
  /** Legacy field. No longer set or rendered by the UI; may still be present on skills saved before icon removal. */
  icon?: string;
  visibility: "public" | "my";
  createdBy: string;
  /** Markdown instructions injected into system context when skill is activated */
  instructions: string;
  steps: SkillStep[];
  inputFields: SkillInputField[];
  createdAt: string;
  packagePayload?: SkillPackagePayload;
}

/** Scope a skill was selected from, as understood by the Dify /load-skills-batch backend. */
export type SkillScope = "public" | "user";

/** A selected skill's identity + origin scope — the only fields the Dify request needs. */
export interface SelectedSkillReference {
  id: string;
  scope: SkillScope;
}

/** Shape of the `inputs.selected_skills` Dify input. The workflow's Start node declares
 *  this variable as a JSON **object** (`{}`), so the selection is sent as an object with
 *  the references under `skills` — never as a bare array, and never as a JSON string.
 *  The `/load-skills-batch` backend reads `SelectedSkillReference[]` out of `skills`. */
export interface SelectedSkillsInput {
  skills: SelectedSkillReference[];
}

/** The only place UI selection state (an array) is turned into the Dify `selected_skills`
 *  object, so every request builder emits an identical shape. An empty selection still
 *  yields an object (`{ skills: [] }`) — the field's type must never flip to an array. */
export function buildSelectedSkillsInput(
  selected: readonly SelectedSkillReference[] = [],
): SelectedSkillsInput {
  return { skills: selected.map(({ id, scope }) => ({ id, scope })) };
}

/** Maps this repo's `Skill.visibility` field to the backend's `SkillScope` contract. */
export function skillVisibilityToScope(visibility: Skill["visibility"]): SkillScope {
  return visibility === "public" ? "public" : "user";
}

export function isSkillScope(value: unknown): value is SkillScope {
  return value === "public" || value === "user";
}
