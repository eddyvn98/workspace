// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeSlideHtmlForRender } from "@/app/workspace/utils/slideHtmlRender";

describe("S2 render-time slide sanitiser", () => {
  it("removes scripts, handlers, overlays and external backgrounds from stored html", () => {
    const html = sanitizeSlideHtmlForRender('<p onclick="x()" style="position:fixed;inset:0;color:red;background:url(https://evil/x)">a<script>alert(1)</script></p><iframe src="https://evil"></iframe><a href="javascript:alert(1)">l</a><a href="/\\evil.com">m</a><img src="/ok.png" onerror="x()">');
    expect(html).not.toMatch(/script|onclick|onerror|iframe|javascript|position|url\(|evil/);
    expect(html).toContain('style="color:red"');
    expect(html).toContain('<img src="/ok.png">');
  });
  it("keeps what the editor emits (tables, classes, widths, task lists)", () => {
    const html = sanitizeSlideHtmlForRender('<table><colgroup><col colwidth="120"></colgroup><tbody><tr><td colspan="2" style="text-align:center">x</td></tr></tbody></table><pre class="language-js"><code>a</code></pre><ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>t</p></div></li></ul><img src="https://ok.example/a.png" width="10" height="5">');
    for (const part of ["<colgroup>", 'colwidth="120"', 'colspan="2"', 'text-align:center', 'class="language-js"', 'data-type="taskList"', 'type="checkbox"', 'width="10"']) expect(html).toContain(part);
  });
  it("returns an empty string for empty input", () => {
    expect(sanitizeSlideHtmlForRender("")).toBe("");
  });
});
