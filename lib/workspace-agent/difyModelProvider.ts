import { resolveDifyChatEndpoint } from "@/app/config/difyEndpointResolver";
import { buildWorkspaceAgentInputs } from "@/app/workspace/utils/workspaceChatRequest";
import { recordDifyBlockingResponse } from "@/lib/ai-usage/server/usage-recorder";
import type {
  WorkspaceModelProposalRequest,
  WorkspaceModelProposalResponse,
  WorkspaceRuntimeModelProvider,
} from "./contracts";

export interface DifyModelProviderConfig {
  url: string;
  apiKey: string;
  fetcher?: typeof fetch;
}

let modelStepPreflight: { url: string; apiKey: string; promise: Promise<void> } | null = null;

function getDifyConfig(): DifyModelProviderConfig {
  const modelStepUrl = process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_URL?.trim();
  const modelStepKey = process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_KEY?.trim();
  if (modelStepUrl || modelStepKey) {
    if (!modelStepUrl || !modelStepKey) throw new Error("Workspace model-step Dify URL and API key must be configured together.");
    const parsed = new URL(modelStepUrl);
    const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase());
    if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
      throw new Error("Workspace model-step Dify must use HTTPS unless it runs on localhost.");
    }
    return { url: modelStepUrl, apiKey: modelStepKey };
  }
  const endpoint = resolveDifyChatEndpoint("WORKSPACE_AGENT_CHAT_KEY");
  if (!endpoint.url || !endpoint.apiKey) throw new Error("Workspace Dify model provider is not configured.");
  return { url: endpoint.url, apiKey: endpoint.apiKey };
}

function parametersUrl(chatUrl: string): string {
  const url = new URL(chatUrl);
  if (!/\/chat-messages\/?$/.test(url.pathname)) throw new Error("Workspace Dify endpoint must end in /chat-messages.");
  url.pathname = url.pathname.replace(/chat-messages\/?$/, "parameters");
  return url.toString();
}

async function ensureModelStepInput(config: DifyModelProviderConfig): Promise<void> {
  if (modelStepPreflight?.url === config.url && modelStepPreflight.apiKey === config.apiKey) {
    return modelStepPreflight.promise;
  }
  const promise = (async () => {
    const response = await (config.fetcher ?? fetch)(parametersUrl(config.url), {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!response.ok) throw new Error(`Dify model-step preflight failed (${response.status}).`);
    const payload = await response.json() as { user_input_form?: unknown };
    const inputNames = Array.isArray(payload.user_input_form)
      ? payload.user_input_form.flatMap((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return [];
          const field = Object.values(row)[0];
          return field && typeof field === "object" && "variable" in field && typeof field.variable === "string"
            ? [field.variable]
            : [];
        })
      : [];
    if (!inputNames.includes("runtime_mode")) {
      throw new Error("Configured Dify app does not expose runtime_mode; local Workspace execution is disabled for this app.");
    }
  })();
  modelStepPreflight = { url: config.url, apiKey: config.apiKey, promise };
  return promise;
}

export function createDifyModelProvider(config?: DifyModelProviderConfig): WorkspaceRuntimeModelProvider {
  return {
    async propose(input: WorkspaceModelProposalRequest): Promise<WorkspaceModelProposalResponse> {
      const resolved = config ?? getDifyConfig();
      await ensureModelStepInput(resolved);
      const startedAt = performance.now();
      const difyUser = input.actorEmail?.trim().toLowerCase() || `workspace-runtime:${input.turnId}`;
      const requestBody: Record<string, unknown> = {
        inputs: {
          ...buildWorkspaceAgentInputs(input.boardId, input.modelSelector),
          runtime_mode: "model_step",
          workspace_user_token: input.workspaceUserToken,
        },
        query: input.query,
        response_mode: "blocking",
        user: difyUser,
        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      };
      const fetcher = resolved.fetcher ?? fetch;
      let response = await fetcher(resolved.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: input.signal,
      });
      if (response.status === 404 && input.conversationId) {
        const freshConversationBody = { ...requestBody };
        delete freshConversationBody.conversation_id;
        response = await fetcher(resolved.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resolved.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(freshConversationBody),
          signal: input.signal,
        });
      }
      if (!response.ok) throw new Error(`Dify model_step failed (${response.status}).`);
      const payload = await response.json() as Record<string, unknown>;
      if (input.actorEmail) {
        recordDifyBlockingResponse({
          email: input.actorEmail,
          difyUser,
          category: "WORKSPACE_AGENT_CHAT_KEY",
          feature: "workspace-runtime-model-step",
          workspaceTurnId: input.turnId,
          observedDurationMs: performance.now() - startedAt,
          difyUrl: resolved.url,
          requestedModel: buildWorkspaceAgentInputs(input.boardId, input.modelSelector).model_selector,
        }, payload);
      }
      if (typeof payload.answer !== "string") throw new Error("Dify model_step returned no answer.");
      return {
        answer: payload.answer,
        conversationId: typeof payload.conversation_id === "string" ? payload.conversation_id : input.conversationId,
      };
    },
  };
}
