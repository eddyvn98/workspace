import { describe, expect, it, vi } from "vitest";
import { recordDifyBlockingResponse } from "@/lib/ai-usage/server/usage-recorder";
import { createDifyModelProvider } from "@/lib/workspace-agent/difyModelProvider";

vi.mock("@/lib/ai-usage/server/usage-recorder", () => ({ recordDifyBlockingResponse: vi.fn() }));

describe("Workspace Dify model provider", () => {
  it("preflights the hosted app and records model-step requests as the signed-in user", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user_input_form: [{ "text-input": { variable: "runtime_mode" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "message-1",
        answer: JSON.stringify({ done: true, message: "ok", actions: [] }),
        conversation_id: "dify-conversation",
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      })));
    const provider = createDifyModelProvider({
      url: "https://dify.example/local-acceptance/chat-messages",
      apiKey: "test-key",
      fetcher,
    });

    await expect(provider.propose({
      boardId: "board-1",
      turnId: "turn-1",
      round: 1,
      modelSelector: "deepseek v4 flash",
      workspaceUserToken: "signed-token",
      actorEmail: "User@example.com",
      query: "proposal prompt",
      conversationId: null,
      signal: new AbortController().signal,
    })).resolves.toEqual({
      answer: JSON.stringify({ done: true, message: "ok", actions: [] }),
      conversationId: "dify-conversation",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://dify.example/local-acceptance/parameters");
    expect(fetcher.mock.calls[1][0]).toBe("https://dify.example/local-acceptance/chat-messages");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      inputs: {
        workspace_id: "board-1",
        model_selector: "deepseek-v4-flash",
        runtime_mode: "model_step",
        workspace_user_token: "signed-token",
      },
      user: "user@example.com",
    });
    expect(recordDifyBlockingResponse).toHaveBeenCalledWith(expect.objectContaining({
      email: "User@example.com",
      difyUser: "user@example.com",
      feature: "workspace-runtime-model-step",
    }), expect.objectContaining({ id: "message-1" }));
  });
});
