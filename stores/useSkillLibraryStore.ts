import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  skillVisibilityToScope,
  type Skill,
  type SkillInputField,
  type SkillStep,
  type SelectedSkillReference,
} from "@/types/skill-library.types";
import { importSkillPackageFile } from "@/lib/skill-package-utils";
import { buildSkillImportPreview, type SkillImportPreview } from "@/lib/skills/skillPackagePreviewClient";
import { streamBuilderChat } from "@/lib/ai-builder/builderChatStream";
import { parseStructuredAiResponse } from "@/lib/ai-builder/parseStructuredAiResponse";
import {
  appendUserTurn,
  dropPendingAssistant,
  formatBuilderTranscript,
  hasUserTurn,
  withAssistantText,
  type BuilderMessage,
} from "@/lib/ai-builder/builderMessages";

/** Structured payload the Skill Builder asks the model for, after normalisation. */
export interface GeneratedSkillData {
  title: string;
  category: string;
  description: string;
  instructions: string;
  steps: SkillStep[];
  inputFields: SkillInputField[];
}

const SKILL_BUILDER_GREETING: BuilderMessage = {
  role: "assistant",
  content:
    "Hi! I'm your AI skill designer. Describe the skill you want to build — what it should do, when it should be used, and any steps or inputs it needs. When we're done, choose \"Generate Skill\" and I'll turn the conversation into a reusable skill.",
};

const SKILL_INPUT_FIELD_TYPES: ReadonlyArray<SkillInputField["type"]> = ["text", "textarea", "select"];

/** Instruction that turns the transcript into the Skill schema. Skill-specific by
 *  design — the shared transport must stay free of Skill/Prompt semantics. */
function buildSkillGenerationInstruction(transcript: string): string {
  return `Based on the following conversation, design a complete skill:
${transcript}

Return pure JSON (no markdown, no explanation):
{
  "title": "Short skill name",
  "category": "Category (e.g. Shopping, Coding, Writing, Research, Productivity, Marketing, Finance, General)",
  "description": "Brief description of what the skill does",
  "instructions": "Full markdown content describing the step-by-step process for AI to follow. Use ## headings and **Step N** clearly.",
  "steps": [
    { "title": "Short step name", "description": "Brief description of what this step does" }
  ],
  "inputFields": [
    { "key": "field_key", "label": "Display label", "type": "text|textarea|select", "options": ["Only for type select"], "placeholder": "Hint...", "required": true }
  ]
}`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Field keys are referenced from instructions/templates, so keep them slug-safe. */
function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Coerces a validated-but-untyped model payload into `GeneratedSkillData`.
 * `steps` and `inputFields` are normalised here (not dropped) so the review form
 * and the save request carry everything the model produced.
 */
function normalizeGeneratedSkill(raw: Record<string, unknown>): GeneratedSkillData {
  const steps: SkillStep[] = asArray(raw.steps)
    .map((entry) => {
      const step = (entry ?? {}) as { title?: unknown; description?: unknown };
      return { title: asText(step.title), description: asText(step.description) };
    })
    .filter((step) => step.title.length > 0 || step.description.length > 0);

  const inputFields: SkillInputField[] = asArray(raw.inputFields)
    .map((entry, index) => {
      const field = (entry ?? {}) as {
        key?: unknown;
        label?: unknown;
        type?: unknown;
        options?: unknown;
        placeholder?: unknown;
        required?: unknown;
      };
      const label = asText(field.label) || asText(field.key);
      const key = toFieldKey(asText(field.key) || label) || `field_${index + 1}`;
      const type = SKILL_INPUT_FIELD_TYPES.find((t) => t === field.type) ?? "text";
      const options = asArray(field.options).map(asText).filter(Boolean);
      const placeholder = asText(field.placeholder);

      return {
        key,
        label: label || key,
        type,
        ...(options.length > 0 ? { options } : {}),
        ...(placeholder ? { placeholder } : {}),
        required: Boolean(field.required),
      };
    })
    .filter((field) => field.label.length > 0);

  return {
    title: asText(raw.title),
    category: asText(raw.category) || "General",
    description: asText(raw.description),
    instructions: asText(raw.instructions),
    steps,
    inputFields,
  };
}

interface ActiveSkillState {
  skill: Skill;
  fieldValues: Record<string, string>;
  /** true after the first message has been sent with skill instructions injected */
  isActivated: boolean;
}

interface SkillLibraryStore {
  skills: Skill[];
  isLoading: boolean;
  /** Set only when the last fetchSkills() call genuinely failed (network/HTTP error) —
   *  distinct from "no skills exist yet", so the UI can show a real error instead of
   *  silently rendering an empty list. Cleared on the next successful fetch. */
  skillsError: string;
  /** The AI Skill Builder conversation is on screen (its own surface, never the
   *  normal chat's message list). Mutually exclusive with `isCreateOpen`. */
  isBuilderOpen: boolean;
  /** The Skill review/edit form is on screen (AI review, or editing a skill). */
  isCreateOpen: boolean;
  activeSkill: ActiveSkillState | null;
  editingSkill: Skill | null;
  savedSkillIds: string[];

  /** The `.skill` file the user picked, awaiting preview confirmation before upload. */
  importPreviewFile: File | null;
  /** Parsed client-side preview of `importPreviewFile`, or null while loading/absent. */
  importPreview: SkillImportPreview | null;
  importPreviewLoading: boolean;
  /** Set only for unexpected preview-parsing failures — distinct from `importPreview.errors`,
   *  which are ordinary package-validation problems shown inline in the preview itself. */
  importPreviewError: string;
  importConfirming: boolean;
  /** Skills selected for the *current* chat input/message (multi-select). Each entry keeps
   *  the scope it was selected under (public vs. my), so switching tabs never reclassifies
   *  an already-selected skill. Sent as `inputs.selected_skills` in chat requests.
   *  Populated only by explicit selection (+ menu, "/" menu, keyword suggestions) —
   *  never by enabling a skill in My Skills. */
  activeSkills: SelectedSkillReference[];
  /** Skills enabled via the My Skills toggle — i.e. available for selection in the
   *  "+" menu, "/" suggestions, and keyword suggestions. Persisted across sessions.
   *  Distinct from `activeSkills`: enabling a skill here never attaches it to the
   *  current chat input. */
  enabledSkillIds: SelectedSkillReference[];

  // Skill Builder state
  skillBuilderMessages: BuilderMessage[];
  skillBuilderAiLoading: boolean;
  skillBuilderGenerating: boolean;
  skillBuilderError: string;
  skillBuilderConversationId: string | null;
  generatedSkillData: GeneratedSkillData | null;

  setCreateOpen: (open: boolean) => void;
  openEditSkill: (skill: Skill) => void;
  setSkillBuilderError: (error: string) => void;
  /** Starts a fresh builder conversation: every transient builder value is reset
   *  and the greeting is seeded. */
  startSkillBuilder: () => void;
  /** Leaves the builder and clears its transient state (normal chat untouched). */
  cancelSkillBuilder: () => void;
  /** Returns from the review form to the builder, keeping the transcript so the
   *  user can refine the conversation and generate again. */
  reopenSkillBuilder: () => void;
  sendSkillBuilderMessage: (text: string) => Promise<void>;
  generateSkillFromConversation: () => Promise<GeneratedSkillData | null>;

  fetchSkills: () => Promise<void>;
  createSkill: (data: Omit<Skill, "id" | "createdAt">) => Promise<Skill>;
  /** Uploads a raw `.skill` archive; the backend extracts, validates, persists to OSS, and returns the created Skill. */
  importSkillPackage: (file: File) => Promise<Skill>;
  /** Parses `file` client-side and populates `importPreview` for the Import Preview modal. */
  beginSkillImportPreview: (file: File) => Promise<void>;
  cancelSkillImportPreview: () => void;
  /** Uploads `importPreviewFile` via importSkillPackage and clears preview state on success.
   *  On failure, leaves the modal open with `importPreviewError` set so the user can retry. */
  confirmSkillImport: () => Promise<Skill | null>;
  editSkill: (id: string, data: Partial<Omit<Skill, "id" | "createdAt">>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  duplicateSkill: (skill: Skill) => Promise<void>;
  shareToPublic: (id: string) => Promise<void>;
  saveToMySkills: (skill: Skill) => Promise<void>;

  activateSkill: (skill: Skill) => void;
  updateFieldValue: (key: string, value: string) => void;
  clearActiveSkill: () => void;
  toggleSkillActive: (skill: Skill) => void;
  /** Drops the most recently selected skill from `activeSkills` (composer Backspace).
   *  Works on the stored reference, so it still removes a skill whose full record is
   *  not in `skills` yet. No-op when nothing is selected. */
  removeLastActiveSkill: () => void;
  isSkillActive: (skill: Skill) => boolean;
  /** Enable/disable a skill for selection (My Skills toggle). Disabling also removes
   *  the skill from the current selection (`activeSkills`) if it was selected there. */
  toggleSkillEnabled: (skill: Skill) => void;
  isSkillEnabled: (skill: Skill) => boolean;
  /** Build the message to send on first activation. Returns null if skill already activated. */
  buildSkillMessage: (userMessage: string) => string;
  markActivated: () => void;
}

export const useSkillLibraryStore = create<SkillLibraryStore>()(
  persist(
    (set, get) => ({
      skills: [],
      isLoading: false,
      skillsError: "",
      isBuilderOpen: false,
      isCreateOpen: false,
      activeSkill: null,
      editingSkill: null,
      savedSkillIds: [],
      activeSkills: [],
      enabledSkillIds: [],

      importPreviewFile: null,
      importPreview: null,
      importPreviewLoading: false,
      importPreviewError: "",
      importConfirming: false,

      skillBuilderMessages: [],
      skillBuilderAiLoading: false,
      skillBuilderGenerating: false,
      skillBuilderError: "",
      skillBuilderConversationId: null,
      generatedSkillData: null,

      setCreateOpen: (open) => {
        if (open) {
          set({ isCreateOpen: true, isBuilderOpen: false });
          return;
        }
        // Closing the form ends the builder session it came from: the draft and
        // the transcript are both dropped so nothing stale can re-prefill or
        // re-open later. "Back to AI Builder" bypasses this (see
        // reopenSkillBuilder) precisely to keep the transcript alive.
        set({
          isCreateOpen: false,
          editingSkill: null,
          generatedSkillData: null,
          skillBuilderMessages: [],
          skillBuilderConversationId: null,
          skillBuilderError: "",
        });
      },
      openEditSkill: (skill) => {
        set({ editingSkill: skill, isCreateOpen: true, isBuilderOpen: false, generatedSkillData: null });
      },
      setSkillBuilderError: (error) => set({ skillBuilderError: error }),

      startSkillBuilder: () => {
        set({
          isBuilderOpen: true,
          isCreateOpen: false,
          editingSkill: null,
          skillBuilderMessages: [SKILL_BUILDER_GREETING],
          skillBuilderAiLoading: false,
          skillBuilderGenerating: false,
          skillBuilderError: "",
          skillBuilderConversationId: null,
          generatedSkillData: null,
        });
      },

      cancelSkillBuilder: () => {
        // No-op when the builder isn't on screen, so cancelling one builder to
        // start the other can never clear an open review form's draft.
        if (!get().isBuilderOpen) return;
        set({
          isBuilderOpen: false,
          skillBuilderMessages: [],
          skillBuilderAiLoading: false,
          skillBuilderGenerating: false,
          skillBuilderError: "",
          skillBuilderConversationId: null,
          generatedSkillData: null,
        });
      },

      reopenSkillBuilder: () => {
        set({ isBuilderOpen: true, isCreateOpen: false, editingSkill: null, generatedSkillData: null, skillBuilderError: "" });
      },

      sendSkillBuilderMessage: async (text) => {
        const queryText = text.trim();
        if (!queryText) return;
        if (get().skillBuilderAiLoading) return;

        const { skillBuilderMessages, skillBuilderConversationId } = get();

        set({
          skillBuilderMessages: appendUserTurn(skillBuilderMessages, queryText),
          skillBuilderAiLoading: true,
          skillBuilderError: "",
        });

        try {
          await streamBuilderChat({
            query: queryText,
            conversationId: skillBuilderConversationId,
            onConversationId: (conversationId) => {
              if (get().skillBuilderConversationId !== conversationId) {
                set({ skillBuilderConversationId: conversationId });
              }
            },
            onToken: (_delta, fullText) => {
              set((state) => ({ skillBuilderMessages: withAssistantText(state.skillBuilderMessages, fullText) }));
            },
          });
        } catch (err) {
          console.error("[SkillLibraryStore] sendSkillBuilderMessage", err);
          set((state) => ({
            skillBuilderMessages: dropPendingAssistant(state.skillBuilderMessages),
            skillBuilderError:
              err instanceof Error ? err.message : "Could not reach the AI service. Please try again.",
          }));
        } finally {
          set({ skillBuilderAiLoading: false });
        }
      },

      generateSkillFromConversation: async () => {
        const { skillBuilderMessages, skillBuilderGenerating, skillBuilderAiLoading } = get();
        if (skillBuilderGenerating || skillBuilderAiLoading) return null;
        if (!hasUserTurn(skillBuilderMessages)) {
          set({ skillBuilderError: "Describe the skill you want before generating." });
          return null;
        }

        set({ skillBuilderGenerating: true, skillBuilderError: "" });

        try {
          const raw = await streamBuilderChat({
            query: buildSkillGenerationInstruction(formatBuilderTranscript(skillBuilderMessages)),
          });
          const parsed = parseStructuredAiResponse<Record<string, unknown>>(raw, {
            label: "skill",
            requiredFields: ["title", "instructions"],
          });
          const generated = normalizeGeneratedSkill(parsed);

          // Hand straight off to the review form: the builder conversation stays
          // in the store so "Back to AI Builder" can resume it.
          set({ generatedSkillData: generated, isBuilderOpen: false, isCreateOpen: true, editingSkill: null });
          return generated;
        } catch (err) {
          console.error("[SkillLibraryStore] generateSkillFromConversation", err);
          set({
            skillBuilderError:
              err instanceof Error ? err.message : "Failed to generate the skill. Please try again.",
          });
          return null;
        } finally {
          set({ skillBuilderGenerating: false });
        }
      },

      fetchSkills: async () => {
        set({ isLoading: true, skillsError: "" });
        try {
          const res = await fetch("/api/skills");
          const data = await res.json();
          if (!res.ok) {
            throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
          }
          // An empty/absent `skills` array on a successful response means "no skills
          // yet" — a real state, not an error, and must not be conflated with one.
          set({ skills: Array.isArray(data.skills) ? data.skills : [] });
        } catch (err) {
          console.error("[SkillLibraryStore] fetchSkills", err);
          set({ skillsError: err instanceof Error ? err.message : "Failed to load skills." });
        } finally {
          set({ isLoading: false });
        }
      },

      createSkill: async (data) => {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to create skill");
        const created: Skill = await res.json();
        set((state) => ({ skills: [...state.skills, created] }));
        return created;
      },

      importSkillPackage: async (file) => {
        const created = await importSkillPackageFile(file);
        set((state) => ({ skills: [...state.skills, created] }));
        return created;
      },

      beginSkillImportPreview: async (file) => {
        set({
          importPreviewFile: file,
          importPreview: null,
          importPreviewLoading: true,
          importPreviewError: "",
        });
        try {
          const preview = await buildSkillImportPreview(file);
          // A newer preview request (or a cancel) may have started while this awaited.
          if (get().importPreviewFile !== file) return;
          set({ importPreview: preview, importPreviewLoading: false });
        } catch (err) {
          if (get().importPreviewFile !== file) return;
          set({
            importPreviewLoading: false,
            importPreviewError: err instanceof Error ? err.message : "Failed to read the selected package.",
          });
        }
      },

      cancelSkillImportPreview: () => {
        set({ importPreviewFile: null, importPreview: null, importPreviewLoading: false, importPreviewError: "", importConfirming: false });
      },

      confirmSkillImport: async () => {
        const { importPreviewFile, importConfirming } = get();
        if (!importPreviewFile || importConfirming) return null;
        set({ importConfirming: true, importPreviewError: "" });
        try {
          const created = await get().importSkillPackage(importPreviewFile);
          set({ importPreviewFile: null, importPreview: null, importPreviewLoading: false, importPreviewError: "", importConfirming: false });
          return created;
        } catch (err) {
          set({ importConfirming: false, importPreviewError: err instanceof Error ? err.message : "Failed to import skill package." });
          return null;
        }
      },

      editSkill: async (id, data) => {
        const res = await fetch("/api/skills", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...data }),
        });
        if (!res.ok) throw new Error("Failed to update skill");
        const updated: Skill = await res.json();
        set((state) => ({ skills: state.skills.map((s) => (s.id === id ? updated : s)) }));
      },

      deleteSkill: async (id) => {
        await fetch(`/api/skills?id=${id}`, { method: "DELETE" });
        set((state) => ({ skills: state.skills.filter((s) => s.id !== id) }));
      },

      duplicateSkill: async (skill) => {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            duplicateFromId: skill.id,
            title: `${skill.title} (Copy)`,
            visibility: "my",
            createdBy: "User",
          }),
        });
        if (!res.ok) throw new Error("Failed to duplicate skill");
        const created: Skill = await res.json();
        set((state) => ({ skills: [...state.skills, created] }));
      },

      shareToPublic: async (id) => {
        const res = await fetch("/api/skills", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, visibility: "public" }),
        });
        if (!res.ok) throw new Error("Failed to share skill");
        const updated: Skill = await res.json();
        set((state) => ({ skills: state.skills.map((s) => (s.id === id ? updated : s)) }));
      },

      saveToMySkills: async (skill) => {
        if (get().savedSkillIds.includes(skill.id)) return;
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duplicateFromId: skill.id, title: skill.title, visibility: "my", createdBy: "User" }),
        });
        if (!res.ok) throw new Error("Failed to save skill");
        const created: Skill = await res.json();
        set((state) => ({
          skills: [...state.skills, created],
          savedSkillIds: [...state.savedSkillIds, skill.id],
        }));
      },

      activateSkill: (skill) => {
        const fieldValues: Record<string, string> = {};
        for (const field of skill.inputFields ?? []) {
          fieldValues[field.key] = "";
        }
        set({ activeSkill: { skill, fieldValues, isActivated: false } });
      },

      updateFieldValue: (key, value) => {
        set((state) => {
          if (!state.activeSkill) return state;
          return {
            activeSkill: {
              ...state.activeSkill,
              fieldValues: { ...state.activeSkill.fieldValues, [key]: value },
            },
          };
        });
      },

      clearActiveSkill: () => set({ activeSkill: null }),

      toggleSkillActive: (skill) => {
        const scope = skillVisibilityToScope(skill.visibility);
        set((state) => {
          const alreadyActive = state.activeSkills.some(
            (s) => s.id === skill.id && s.scope === scope,
          );
          return {
            activeSkills: alreadyActive
              ? state.activeSkills.filter((s) => !(s.id === skill.id && s.scope === scope))
              : [...state.activeSkills, { id: skill.id, scope }],
          };
        });
      },

      removeLastActiveSkill: () => {
        set((state) =>
          state.activeSkills.length === 0
            ? state
            : { activeSkills: state.activeSkills.slice(0, -1) },
        );
      },

      isSkillActive: (skill) => {
        const scope = skillVisibilityToScope(skill.visibility);
        return get().activeSkills.some((s) => s.id === skill.id && s.scope === scope);
      },

      toggleSkillEnabled: (skill) => {
        const scope = skillVisibilityToScope(skill.visibility);
        set((state) => {
          const alreadyEnabled = state.enabledSkillIds.some(
            (s) => s.id === skill.id && s.scope === scope,
          );
          if (alreadyEnabled) {
            return {
              enabledSkillIds: state.enabledSkillIds.filter((s) => !(s.id === skill.id && s.scope === scope)),
              // Disabling a skill must also drop it from the current selection.
              activeSkills: state.activeSkills.filter((s) => !(s.id === skill.id && s.scope === scope)),
            };
          }
          return { enabledSkillIds: [...state.enabledSkillIds, { id: skill.id, scope }] };
        });
      },

      isSkillEnabled: (skill) => {
        const scope = skillVisibilityToScope(skill.visibility);
        return get().enabledSkillIds.some((s) => s.id === skill.id && s.scope === scope);
      },

      buildSkillMessage: (userMessage) => {
        const { activeSkill } = get();
        if (!activeSkill) return userMessage;
        if (activeSkill.isActivated) return userMessage;

        const { skill, fieldValues } = activeSkill;
        let instructions = skill.instructions;

        // Substitute input field values into instructions
        for (const [key, value] of Object.entries(fieldValues)) {
          if (value.trim()) {
            instructions += `\n\n**${skill.inputFields.find((f) => f.key === key)?.label ?? key}:** ${value}`;
          }
        }

        const parts = [instructions];
        if (userMessage.trim()) parts.push(`\n\n---\n\n${userMessage}`);
        return parts.join("");
      },

      markActivated: () => {
        set((state) => {
          if (!state.activeSkill) return state;
          return { activeSkill: { ...state.activeSkill, isActivated: true } };
        });
      },
    }),
    {
      name: "skill-library-saved-ids",
      partialize: (state) => ({
        savedSkillIds: state.savedSkillIds,
        activeSkill: state.activeSkill,
        enabledSkillIds: state.enabledSkillIds,
      }),
    },
  ),
);
