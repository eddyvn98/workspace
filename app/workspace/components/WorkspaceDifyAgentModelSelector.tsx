"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIModelGroups } from "@/lib/ai-models";
import {
  WORKSPACE_DIFY_AGENT_TEST_MODEL_SELECTORS,
  WORKSPACE_DIFY_VISIBLE_MODEL_IDS,
} from "@/lib/ai-model-catalog";
import { resolveWorkspaceDifyModelSelector } from "../utils/workspaceChatRequest";
import { useMessageStore } from "@/stores/useMessageStore";
import { Check, ChevronDown } from "lucide-react";

const allowedModels = new Set<string>(WORKSPACE_DIFY_AGENT_TEST_MODEL_SELECTORS);
const hiddenWorkspaceModelGroups = new Set(["google"]);
const compactWorkspaceModels = new Set<string>(WORKSPACE_DIFY_VISIBLE_MODEL_IDS);

export function WorkspaceDifyAgentModelSelector() {
  const { selectedModel, setSelectedModel } = useMessageStore();
  const models = AIModelGroups
    .filter((group) => !hiddenWorkspaceModelGroups.has(group.id))
    .flatMap((group) => group.models)
    .filter((model) => compactWorkspaceModels.has(model.id))
    .filter((model) => allowedModels.has(resolveWorkspaceDifyModelSelector(model.id)));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-transparent text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Choose a model for Dify Agent test"
        >
          <span className="flex h-4 w-4 items-center justify-center">{selectedModel?.icon}</span>
          <span className="max-w-[120px] truncate">{selectedModel?.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-64 rounded-2xl border bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Model running in Agent test
        </div>
        {models.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => setSelectedModel(model)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base dark:bg-slate-800">{model.icon}</span>
            <span className="flex-1 truncate font-medium text-slate-800 dark:text-slate-200">{model.name}</span>
            {selectedModel?.id === model.id && <Check className="h-4 w-4 text-orange-500" />}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
