import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captionImageViaDify } from "@/lib/dify-caption";

const calls: Array<{ url: string; auth: string | null }> = [];

beforeEach(() => {
  calls.length = 0;
  process.env.NEXT_PUBLIC_AGENT_API_URL = "https://dify.test/v1/chat-messages";
  process.env.WORKSPACE_IMAGE_CAPTION_KEY = "app-caption";
  process.env.CHAT_KEY = "app-chat";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("Authorization") });
    if (url.endsWith("/files/upload")) return new Response(JSON.stringify({ id: "file-1" }), { status: 201 });
    return new Response(JSON.stringify({ data: { outputs: { caption: "text ORCHID_SECRET_31" } } }), { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WORKSPACE_IMAGE_CAPTION_KEY;
});

describe("captionImageViaDify with a dedicated workflow key", () => {
  it("runs the caption workflow with its own key instead of CHAT_KEY", async () => {
    const caption = await captionImageViaDify(Buffer.from("x"), "image/png", "a.png", "me@x.com");
    expect(caption).toBe("text ORCHID_SECRET_31");
    expect(calls.map((c) => c.url)).toEqual([
      "https://dify.test/v1/files/upload",
      "https://dify.test/v1/workflows/run",
    ]);
    expect(calls.every((c) => c.auth === "Bearer app-caption")).toBe(true);
  });
});
