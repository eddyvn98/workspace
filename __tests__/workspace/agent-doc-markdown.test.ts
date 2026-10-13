import { describe, expect, it } from "vitest";
import { markdownToDocHtml } from "@/app/api/workspaces/[id]/agent/agentMarkdownToHtml";
import { sanitizeAgentHtml } from "@/app/api/workspaces/[id]/agent/agentHtmlSanitize";

describe("markdownToDocHtml fidelity", () => {
  it("turns thematic breaks into hr", () => {
    expect(markdownToDocHtml("a\n\n---\n\n***\n\nb")).toBe("<p>a</p><hr><hr><p>b</p>");
  });

  it("parses fenced code blocks without interpreting their content", () => {
    const html = markdownToDocHtml("```ts\nconst a = 1 < 2;\n# not a heading\n```\nafter");
    expect(html).toBe("<pre><code>const a = 1 &lt; 2;\n# not a heading</code></pre><p>after</p>");
  });

  it("nests lists by 2 or 4 space indentation", () => {
    const two = markdownToDocHtml("- a\n  - b\n    - c\n- d");
    expect(two).toBe("<ul><li><p>a</p><ul><li><p>b</p><ul><li><p>c</p></li></ul></li></ul></li><li><p>d</p></li></ul>");
    const four = markdownToDocHtml("1. a\n    - b\n2. c");
    expect(four).toBe("<ol><li><p>a</p><ul><li><p>b</p></li></ul></li><li><p>c</p></li></ol>");
  });

  it("nests task lists and keeps checked state", () => {
    const html = markdownToDocHtml("- [x] done\n  - [ ] sub");
    expect(html).toContain('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>sub</p>');
  });

  it("keeps the ordered list start number", () => {
    expect(markdownToDocHtml("3. x\n4. y")).toBe('<ol start="3"><li><p>x</p></li><li><p>y</p></li></ol>');
    expect(markdownToDocHtml("1. x")).toBe("<ol><li><p>x</p></li></ol>");
  });

  it("keeps line breaks in multi-line quotes and splits paragraphs on empty quote lines", () => {
    expect(markdownToDocHtml("> one\n> two\n>\n> three")).toBe("<blockquote><p>one<br>two</p><p>three</p></blockquote>");
  });

  it("hard-breaks paragraph lines only after two spaces or a backslash", () => {
    expect(markdownToDocHtml("a\nb")).toBe("<p>a b</p>");
    expect(markdownToDocHtml("a  \nb")).toBe("<p>a<br>b</p>");
    expect(markdownToDocHtml("a\\\nb")).toBe("<p>a<br>b</p>");
  });
});

describe("doc sanitizer text-align", () => {
  it("keeps only text-align on doc text blocks", () => {
    const html = '<p style="text-align:center; color:red">a</p><h2 style="TEXT-ALIGN: right">b</h2><li style="text-align:justify">c</li><blockquote style="text-align:left">d</blockquote><p style="text-align:evil">e</p><div style="text-align:center">f</div>';
    const out = sanitizeAgentHtml(html, { docAlign: true });
    expect(out).toContain('<p style="text-align: center">a</p>');
    expect(out).toContain('<h2 style="text-align: right">b</h2>');
    expect(out).toContain('<li style="text-align: justify">c</li>');
    expect(out).toContain('<blockquote style="text-align: left">d</blockquote>');
    expect(out).toContain("<p>e</p>");
    expect(out).toContain("<div>f</div>");
    expect(out).not.toContain("color");
  });

  it("still strips every style without docAlign and keeps slides' own allowStyle", () => {
    expect(sanitizeAgentHtml('<p style="text-align:center">a</p>')).toBe("<p>a</p>");
    expect(sanitizeAgentHtml('<p style="color:red">a</p>', { allowStyle: true })).toBe('<p style="color:red">a</p>');
  });
});
