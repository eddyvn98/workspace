// @vitest-environment node

import { describe, expect, it } from "vitest";
import { addDocTextToBlocks, compactAgentBlock } from "@/app/api/workspaces/[id]/agentReadSummary";
import { docHtmlLines, docHtmlToText } from "@/app/api/workspaces/[id]/agent/docHtmlText";
import { markdownToDocHtml } from "@/app/api/workspaces/[id]/agent/agentMarkdownToHtml";

const HTML = [
  '<h1 data-line-id="a">Title</h1>',
  '<p data-line-id="b">Some <strong>bold</strong> &amp; <a href="https://x.io">link</a></p>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-line-id="c"><p>done</p></li><li data-type="taskItem" data-checked="false" data-line-id="d"><p>todo</p></li></ul>',
  '<ol start="3"><li data-line-id="e"><p>three</p><ul><li><p>nested</p></li></ul></li></ol>',
  '<blockquote data-line-id="f"><p data-line-id="g">quote</p></blockquote><hr>',
  '<pre><code>x = 1</code></pre>',
  '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
  '<div data-workspace-table="true" data-table-id="t9"></div>',
].join("");

describe("doc read for the agent", () => {
  it("renders markdown-ish text with headings, lists, checkboxes, tables and embeds", () => {
    expect(docHtmlToText(HTML)).toBe([
      "# Title",
      "Some **bold** & [link](https://x.io)",
      "- [x] done\n- [ ] todo",
      "3. three\n  - nested",
      "> quote",
      "---",
      "```\nx = 1\n```",
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
      "[embedded table: t9]",
    ].join("\n\n"));
  });

  it("round-trips markdown through html back to equivalent text", () => {
    const md = "## Plan\n\n- a\n  - b\n\n- [ ] c";
    expect(docHtmlToText(markdownToDocHtml(md))).toBe("## Plan\n\n- a\n  - b\n\n- [ ] c");
  });

  it("lists addressable lines without duplicating inner paragraphs", () => {
    expect(docHtmlLines(HTML).map((line) => line.lineId)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(docHtmlLines(HTML)[2]).toEqual({ lineId: "c", type: "taskItem", text: "done" });
  });

  it("compact summary truncates docText at 4000 chars and flags it", () => {
    const html = `<p data-line-id="x">${"word ".repeat(1500)}</p>`;
    const compact = compactAgentBlock("d", { id: "d", type: "doc", data: { html } }, "block") as { data: Record<string, any> };
    expect(compact.data.docText).toHaveLength(4000);
    expect(compact.data.docTextTruncated).toBe(true);
    expect(compact.data.docLines).toEqual([{ lineId: "x", type: "p", text: "word ".repeat(16).trim().slice(0, 80) }]);
    expect(compact.data.html).toBeUndefined();
  });

  it("compact summary keeps short docs whole", () => {
    const compact = compactAgentBlock("d", { id: "d", type: "doc", data: { html: HTML } }, "block") as { data: Record<string, any> };
    expect(compact.data.docText).toBe(docHtmlToText(HTML));
    expect(compact.data.docTextTruncated).toBeUndefined();
  });

  it("view=full adds the complete docText next to the raw html and keeps other blocks untouched", () => {
    const html = `<p>${"word ".repeat(1500)}</p>`;
    const text = { id: "n", type: "text", data: { markdown: "hi" } };
    const out = addDocTextToBlocks({ d: { id: "d", type: "doc", data: { html } }, n: text }) as Record<string, any>;
    expect(out.d.data.html).toBe(html);
    expect(out.d.data.docText.length).toBeGreaterThan(4000);
    expect(out.d.data.docTextTruncated).toBeUndefined();
    expect(out.n).toBe(text);
  });

  it("table blocks report which doc embeds them", () => {
    const compact = compactAgentBlock("t", { id: "t", type: "table", embeddedInDocId: "d", data: { cells: [["a"]] } }, "block");
    expect(compact.embeddedInDocId).toBe("d");
  });
});
