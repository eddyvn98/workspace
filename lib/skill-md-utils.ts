import type { Skill } from "@/types/skill-library.types";
import { SkillImportError } from "@/lib/skills/skillPackageErrors";

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function parseFrontmatterValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

export function skillToMarkdown(skill: Skill): string {
  const lines: string[] = [
    "---",
    `name: ${yamlScalar(skill.title)}`,
    `description: ${yamlScalar(skill.description)}`,
    `category: ${yamlScalar(skill.category)}`,
    ...(skill.icon ? [`icon: ${yamlScalar(skill.icon)}`] : []),
    "---",
    "",
    skill.icon ? `# ${skill.icon} ${skill.title}` : `# ${skill.title}`,
    "",
  ];

  if (skill.description) {
    lines.push(`> ${skill.description}`, "");
  }

  lines.push("## Instructions", "", skill.instructions, "");

  if (skill.steps?.length > 0) {
    lines.push("---", "", "## Steps", "");
    skill.steps.forEach((step, i) => {
      lines.push(`### ${i + 1}. ${step.title}`, step.description, "");
    });
  }

  if (skill.inputFields?.length > 0) {
    lines.push("---", "", "## Input Fields", "");
    skill.inputFields.forEach((field) => {
      const req = field.required ? " *(required)*" : "";
      const ph = field.placeholder ? ` — placeholder: "${field.placeholder}"` : "";
      lines.push(`- **${field.label}** (\`${field.key}\`): \`${field.type}\`${req}${ph}`);
      if (field.options?.length) {
        lines.push(`  - Options: ${field.options.map((o) => `\`${o}\``).join(", ")}`);
      }
    });
    lines.push("");
  }

  return lines.join("\n");
}

interface LeadingFrontmatter {
  exists: boolean;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  endIndex: number;
}

/**
 * Only a `---`/`---` block anchored at the very start of the file counts as
 * frontmatter. Any later `---` line is ordinary Markdown and must not be
 * treated as a boundary — content after the closing delimiter belongs to
 * instructions verbatim, however many `---` separators it contains.
 */
function extractLeadingFrontmatter(normalizedMarkdown: string): LeadingFrontmatter {
  const match = normalizedMarkdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { exists: false, endIndex: 0 };
  }

  const yaml = match[1];
  const get = (key: string) =>
    parseFrontmatterValue(yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1] ?? "");

  return {
    exists: true,
    name: get("name") || undefined,
    description: get("description") || undefined,
    category: get("category") || undefined,
    icon: get("icon") || undefined,
    endIndex: match[0].length,
  };
}

/**
 * Only Skill Name, Description, and Category are recognized metadata (from
 * leading YAML frontmatter). Everything else — including headings like
 * "## Steps" or "## Input Fields" and any "---" inside the body — is
 * preserved verbatim as `instructions`, never parsed into separate fields.
 */
export function markdownToSkill(md: string): Partial<Skill> {
  const normalized = md.replace(/\r\n/g, "\n");
  const frontmatter = extractLeadingFrontmatter(normalized);

  const result: Partial<Skill> = {
    steps: [],
    inputFields: [],
  };

  if (frontmatter.name) result.title = frontmatter.name;
  if (frontmatter.description) result.description = frontmatter.description;
  if (frontmatter.category) result.category = frontmatter.category;
  if (frontmatter.icon) result.icon = frontmatter.icon;

  result.instructions = frontmatter.exists
    ? normalized.slice(frontmatter.endIndex).trim()
    : normalized.trim();

  return result;
}

export interface StrictSkillMdResult {
  title: string;
  description: string;
  instructions: string;
}

/**
 * Strict variant of {@link markdownToSkill} used when validating a SKILL.md pulled
 * out of an imported `.skill` package: frontmatter, `name`, `description`, and a
 * non-empty body are all mandatory here (unlike the free-form `.md` import path).
 */
export function parseSkillMdStrict(md: string): StrictSkillMdResult {
  const normalized = md.replace(/\r\n/g, "\n");
  const frontmatter = extractLeadingFrontmatter(normalized);

  if (!frontmatter.exists) {
    throw new SkillImportError("INVALID_SKILL_FRONTMATTER", "SKILL.md must begin with YAML frontmatter delimited by '---'.");
  }
  if (!frontmatter.name) {
    throw new SkillImportError("INVALID_SKILL_FRONTMATTER", "SKILL.md frontmatter is missing the required 'name' field.");
  }
  if (!frontmatter.description) {
    throw new SkillImportError("INVALID_SKILL_FRONTMATTER", "SKILL.md frontmatter is missing the required 'description' field.");
  }

  const body = normalized.slice(frontmatter.endIndex).trim();
  if (!body) {
    throw new SkillImportError("EMPTY_SKILL_INSTRUCTIONS", "SKILL.md body must not be empty.");
  }

  return { title: frontmatter.name, description: frontmatter.description, instructions: body };
}

/** Re-serializes a packaged skill's SKILL.md: frontmatter (name/description) + raw body, verbatim. */
export function buildSkillMdContent(name: string, description: string, body: string): string {
  return `---\nname: ${yamlScalar(name)}\ndescription: ${yamlScalar(description)}\n---\n\n${body.trim()}\n`;
}

export function downloadSkillAsMd(skill: Skill): void {
  const content = skillToMarkdown(skill);
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${skill.title.toLowerCase().replace(/\s+/g, "-")}.skill.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
