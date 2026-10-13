import type React from "react";
import type { AIModel, AIModelGroup } from "./ai-models";

export const WORKSPACE_DIFY_MODEL_SELECTORS = [
  "qwen/qwen3.6-flash",
  "qwen/qwen3.6-plus",
  "qwen/qwen3.8-max",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5",
  "moonshotai/kimi-k3",
  "z-ai/glm-5.2",
] as const;

/** Official DeepSeek API ID for the model currently serving V4.1-Flash. */
export const DEEPSEEK_FLASH_MODEL_ID = "deepseek-flash" as const;

/** Models shown to users and routed through the server's configured providers. */
export const WORKSPACE_DIFY_COMPACT_MODEL_IDS = [
  "qwen-flash",
  "qwen-plus",
  "qwen/qwen3.8-max",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "claude-sonnet-5",
  "anthropic/claude-opus-5",
  "moonshotai/kimi-k3",
  "z-ai/glm-5.2",
] as const;

/** Local development keeps the user's personal DeepSeek test model available. */
export const WORKSPACE_DIFY_LOCAL_TEST_MODEL_IDS =
  process.env.NODE_ENV === "production" ? [] as const : [DEEPSEEK_FLASH_MODEL_ID] as const;

export const WORKSPACE_DIFY_VISIBLE_MODEL_IDS = [
  ...WORKSPACE_DIFY_COMPACT_MODEL_IDS,
  ...WORKSPACE_DIFY_LOCAL_TEST_MODEL_IDS,
] as const;

// The deployed Dify workflow accepts only router-backed UI choices. Local
// development may additionally target its separate personal DeepSeek workflow.
export const WORKSPACE_DIFY_AGENT_TEST_MODEL_SELECTORS =
  process.env.NODE_ENV === "production"
    ? WORKSPACE_DIFY_MODEL_SELECTORS
    : [...WORKSPACE_DIFY_MODEL_SELECTORS, "deepseek-v4-flash"] as const;

export type WorkspaceDifyModelSelector = typeof WORKSPACE_DIFY_MODEL_SELECTORS[number];

export interface AIModelCatalogIcons {
  qwen: React.ReactElement;
  gemini: React.ReactElement;
  openai: React.ReactElement;
  claude: React.ReactElement;
  grok: React.ReactElement;
  deepseek: React.ReactElement;
  kimi: React.ReactElement;
  generic: React.ReactElement;
}

function model(
  id: string,
  name: string,
  icon: React.ReactElement,
  capabilities: ("file" | "image")[] = ["file", "image"],
): AIModel {
  return { id, name, capabilities, icon };
}

export function createAIModelGroups(icons: AIModelCatalogIcons): AIModelGroup[] {
  return [
    {
      id: "qwen",
      name: "Qwen",
      models: [
        model("qwen-flash", "Qwen 3.6 Flash", icons.qwen),
        model("qwen-plus", "Qwen 3.6 Plus", icons.qwen),
        model("qwen/qwen3.8-max", "Qwen 3.8 Max · OpenRouter", icons.qwen),
        model("qwen3.8-max", "Qwen 3.8 Max · Tongyi", icons.qwen),
        model("qwen3.7-max", "Qwen 3.7 Max", icons.qwen),
        model("qwen3.7-max-2026-06-08", "Qwen 3.7 Max (2026-06-08)", icons.qwen),
        model("qwen3.7-plus", "Qwen 3.7 Plus", icons.qwen),
        model("qwen3.7-flash", "Qwen 3.7 Flash", icons.qwen),
      ],
    },
    {
      id: "google",
      name: "Google",
      models: [
        model("google/gemini-3.7-flash", "Gemini 3.7 Flash", icons.gemini),
        model("gemini-3-pro", "Gemini 3.1 Pro Preview", icons.gemini),
        model("google/gemini-3.5-flash", "Gemini 3.5 Flash", icons.gemini),
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      models: [
        model("gpt-5-chat", "GPT-5.4", icons.openai),
        model("openai/gpt-5.6-sol", "GPT-5.6 Sol", icons.openai),
        model("openai/gpt-5.6-terra", "GPT-5.6 Terra", icons.openai),
        model("openai/gpt-5.6-luna", "GPT-5.6 Luna", icons.openai),
      ],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      models: [
        model("claude-sonnet", "Claude Sonnet 4.6", icons.claude),
        model("claude-sonnet-5", "Claude Sonnet 5", icons.claude),
        model("anthropic/claude-opus-5", "Claude Opus 5", icons.claude),
        model("anthropic/claude-opus-4.7", "Claude Opus 4.7", icons.claude),
      ],
    },
    {
      id: "xai",
      name: "xAI",
      models: [
        model("xai-grok", "Grok 4.3", icons.grok),
        model("x-ai/grok-4.6", "Grok 4.6", icons.grok),
      ],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      models: [
        model("deepseek", "DeepSeek V4 Pro", icons.deepseek, ["file"]),
        model("deepseek/deepseek-v4-pro-0813", "DeepSeek V4 Pro (0813)", icons.deepseek, ["file"]),
        model("deepseek-v4-pro", "DeepSeek V4 Pro · Tongyi", icons.deepseek, ["file"]),
        model(DEEPSEEK_FLASH_MODEL_ID, "DeepSeek V4.1 Flash", icons.deepseek),
      ],
    },
    {
      id: "moonshot",
      name: "Moonshot AI",
      models: [
        model("kimi-k2", "Kimi K2.6", icons.kimi),
        model("moonshotai/kimi-k3", "Kimi K3", icons.kimi),
      ],
    },
    {
      id: "zai",
      name: "Z.AI",
      models: [model("z-ai/glm-5.2", "GLM-5.2 · OpenRouter", icons.generic)],
    },
    {
      id: "minimax",
      name: "MiniMax",
      models: [model("minimax/minimax-m3", "MiniMax M3", icons.generic)],
    },
    {
      id: "tongyi-other",
      name: "Tongyi",
      models: [model("glm-5.2", "GLM-5.2 · Tongyi", icons.generic)],
    },
  ];
}
