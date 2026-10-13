// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeAgentHtml } from "@/app/api/workspaces/[id]/agent/agentHtmlSanitize";
import { markdownToDocHtml, looksLikeHtml } from "@/app/api/workspaces/[id]/agent/agentMarkdownToHtml";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

const empty = (): AgentBoardState => ({ title: "t", blockOrder: [], blocks: {}, connectors: {} });

describe("sanitizeAgentHtml", () => {
  it("drops scripts, event handlers and javascript urls but keeps structure", () => {
    const out = sanitizeAgentHtml('<h1 onclick="x()">Hi</h1><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src="https://a.io/i.png" onerror="x()"><p style="color:red">t</p>');
    expect(out).toBe('<h1>Hi</h1><a>l</a><img src="https://a.io/i.png"><p>t</p>');
  });
  it("keeps safe inline style only when allowed", () => {
    expect(sanitizeAgentHtml('<div style="color:red; background:url(x)">a</div>', { allowStyle: true })).toBe('<div style="color:red">a</div>');
  });
  it("keeps editor task list attributes", () => {
    expect(sanitizeAgentHtml('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>x</p></li></ul>')).toContain('data-checked="true"');
  });
});

describe("markdownToDocHtml", () => {
  it("converts headings, lists, quote, table, checklist and image", () => {
    const html = markdownToDocHtml("# Title\n\nIntro **bold**.\n\n1. one\n2. two\n\n- a\n- b\n\n> wise\n\n| Tool | Cost |\n|---|---|\n| X | 1 |\n\n- [ ] todo\n- [x] done\n\n![pic](https://a.io/p.png)");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ol><li><p>one</p></li>");
    expect(html).toContain("<ul><li><p>a</p></li>");
    expect(html).toContain("<blockquote><p>wise</p></blockquote>");
    expect(html).toContain("<th><p>Tool</p></th>");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('<img src="https://a.io/p.png" alt="pic">');
    expect(looksLikeHtml(html)).toBe(true);
  });
});

describe("create_block doc", () => {
  it("accepts markdown and stores sanitized html", () => {
    const state = empty();
    const { ids } = applyAgentAction(state, { type: "create_block", blockType: "doc", data: { markdown: "# Guide\n\n- a" } });
    expect((state.blocks[ids[0]].data as { html: string }).html).toBe("<h1>Guide</h1><ul><li><p>a</p></li></ul>");
  });
  it("sanitizes html passed directly", () => {
    const state = empty();
    const { ids } = applyAgentAction(state, { type: "create_block", blockType: "doc", html: '<p>ok</p><script>bad()</script>' });
    expect((state.blocks[ids[0]].data as { html: string }).html).toBe("<p>ok</p>");
  });
});

describe("slide deck html", () => {
  it("sanitizes slides passed through create_block", () => {
    const state = empty();
    const { ids } = applyAgentAction(state, { type: "create_block", blockType: "slideDeck", data: { slides: { s1: { id: "s1", name: "A", html: "<h1>Hi</h1><script>x()</script>" } }, slideOrder: ["s1"] } });
    const deck = state.blocks[ids[0]].data as { slides: Record<string, { html: string }> };
    expect(deck.slides.s1.html).toBe("<h1>Hi</h1>");
  });
});
