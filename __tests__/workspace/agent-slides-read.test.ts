// @vitest-environment node

import { describe, expect, it } from "vitest";
import { compactAgentBlock } from "@/app/api/workspaces/[id]/agentReadSummary";
import { formatSelectedBlocksContext } from "@/app/workspace/utils/workspaceChatContext";
import { slideHtmlToText } from "@/app/workspace/utils/slideText";
import type { CanvasBlock } from "@/app/workspace/types/block";

const long = "word ".repeat(300);
const deckBlock = {
  id: "d1",
  type: "slideDeck",
  data: {
    title: "Roadmap",
    aspectRatio: "4:3",
    activeSlideId: "s2",
    showSlideNumbers: true,
    theme: { backgroundColor: "#0f172a", textColor: "#fff", fontFamily: "Georgia, serif", evil: "x" },
    slideOrder: ["s1", "s2", "gone"],
    slides: {
      s1: { id: "s1", name: "Intro", html: "<h1>Hello &amp; welcome</h1><p>Line</p><ul><li><p>One</p></li><li><p>Two</p></li></ul>", backgroundColor: "#fef3c7", presenterNotes: "Greet", status: "done" },
      s2: { id: "s2", name: "Long", html: `<p>${long}</p>`, hidden: true, presenterNotes: long },
    },
  },
};

describe("slide deck read summary", () => {
  it("exposes slide text, look, status, notes and deck settings", () => {
    const summary = compactAgentBlock("d1", deckBlock as never, "block");
    const data = summary.data as Record<string, unknown> & { slides: Array<Record<string, unknown>> };
    expect(data.slideIds).toEqual(["s1", "s2"]);
    expect(data.slides[0]).toEqual({ id: "s1", name: "Intro", htmlText: "# Hello & welcome\nLine\n- One\n- Two", backgroundColor: "#fef3c7", presenterNotes: "Greet", status: "done" });
    expect(data).toMatchObject({ aspectRatio: "4:3", activeSlideId: "s2", deckTitle: "Roadmap", showSlideNumbers: true, theme: { backgroundColor: "#0f172a", textColor: "#fff", fontFamily: "Georgia, serif" } });
    expect(data.theme).not.toHaveProperty("evil");
  });

  it("truncates long text and notes and flags hidden slides", () => {
    const data = compactAgentBlock("d1", deckBlock as never, "block").data as { slides: Array<{ htmlText: string; presenterNotes: string; hidden?: boolean }> };
    expect(data.slides[1].htmlText.length).toBeLessThanOrEqual(600);
    expect(data.slides[1].htmlText.endsWith("…")).toBe(true);
    expect(data.slides[1].presenterNotes.length).toBeLessThanOrEqual(300);
    expect(data.slides[1].hidden).toBe(true);
  });

  it("renders tables and images as readable text", () => {
    expect(slideHtmlToText('<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table><img src="https://x/y.png">')).toBe("A | B\n[image]");
  });

  it("summarises a selected slide deck for chat context instead of dumping raw html", () => {
    const { contextPrompt } = formatSelectedBlocksContext(["d1"], { d1: { ...deckBlock, transform: { override: { x: 0, y: 0, w: 600, h: 400 } } } as unknown as CanvasBlock });
    expect(contextPrompt).toContain('slideId=s1 name="Intro" (status=done, background=#fef3c7)');
    expect(contextPrompt).toContain("# Hello & welcome / Line / - One / - Two");
    expect(contextPrompt).toContain("aspectRatio=4:3");
    expect(contextPrompt).not.toContain("<h1>");
  });
});
