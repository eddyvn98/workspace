import type { Skill } from "@/types/skill-library.types";

interface SkillImportErrorBody {
  success: false;
  code: string;
  message: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Partial<SkillImportErrorBody>;
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Uploads a raw `.skill` archive to the backend for extraction, validation, and
 * OSS-backed persistence. The archive is never parsed in the browser — this is
 * a plain multipart upload, and the fully-created Skill record comes back.
 */
export async function importSkillPackageFile(file: File): Promise<Skill> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/skills", { method: "POST", body: formData });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to import skill package."));
  }
  return (await res.json()) as Skill;
}

/** Downloads a packaged skill as a `.skill` archive, rebuilt server-side from its stored OSS objects. */
export async function downloadSkillPackage(skill: Skill): Promise<void> {
  const res = await fetch(`/api/skills/package?id=${encodeURIComponent(skill.id)}`);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to export skill package."));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${skill.title.toLowerCase().trim().replace(/\s+/g, "-") || "skill"}.skill`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
