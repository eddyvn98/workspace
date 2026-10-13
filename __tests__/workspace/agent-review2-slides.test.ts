// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { sanitizeAgentHtml } from "@/app/api/workspaces/[id]/agent/agentHtmlSanitize";
import { clampPresentIndex, normalizeSlideDeckData, presentStartIndex, presentableSlideOrder } from "@/app/workspace/utils/slideDeckOps";
import { isSafeSlideUrl, sanitizeSlideStyle } from "@/app/workspace/utils/slideHtmlSafety";
import type { SlideDeckPayload } from "@/app/workspace/types/slide";

function setup() {
  const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Slides" };
  const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
  const data = () => board.blocks[deck].data as unknown as SlideDeckPayload & Record<string, unknown>;
  const first = data().slideOrder[0];
  return { board, deck, first, data };
}

describe("S1 stored slides are not re-sanitised", () => {
  it("keeps editor output on an unrelated deck edit", () => {
    const { board, deck, first, data } = setup();
    const stored = '<p data-foo="1" class="x" style="color:red">hi <custom-tag>t</custom-tag></p><table><colgroup><col colwidth="100"></colgroup></table>';
    (data().slides[first] as { html: string }).html = stored;
    expect(applyAgentAction(board, { type: "update_slide_deck", blockId: deck, title: "New" }).ids).toEqual([deck]);
    expect(data().slides[first].html).toBe(stored);
  });
  it("still sanitises html the agent supplies", () => {
    const { board, deck, first, data } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, html: '<p onclick="x()">a<script>x</script></p>' });
    expect(data().slides[first].html).toBe("<p>a</p>");
  });
});

describe("S2 style allowlist", () => {
  it("drops external loads, overlays and escapes", () => {
    for (const bad of [
      "background-image: image-set('https://evil/x' 1x)", "background: u\\72l(https://evil/x)", "background: url(x)",
      "position:fixed", "z-index:99999", "inset:0", "transform:scale(9)", "filter:blur(2px)", "color:var(--x)", "width:expression(1)",
    ]) expect(sanitizeSlideStyle(bad)).toBe("");
    expect(sanitizeAgentHtml('<p style="position:fixed; inset:0; z-index:99999; background:#fff; width:100vw">x</p>', { allowStyle: true })).toBe('<p style="width:100vw">x</p>');
  });
  it("keeps what the editor emits", () => {
    expect(sanitizeSlideStyle("color: #ff0000; text-align: center; font-size: 24px; font-family: Georgia, serif; margin-top: 4px; border: 1px solid #ccc"))
      .toBe("color:#ff0000; text-align:center; font-size:24px; font-family:Georgia, serif; margin-top:4px; border:1px solid #ccc");
    expect(sanitizeSlideStyle("border-image: url(x); color:red")).toBe("color:red");
  });
});

describe("S3 backslash urls", () => {
  it("rejects backslashes in image and link urls", () => {
    expect(isSafeSlideUrl("/\\evil.com/x.png")).toBe(false);
    expect(sanitizeAgentHtml('<a href="/\\evil.com">x</a>')).toBe("<a>x</a>");
    const { board, deck, first, data } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, layout: "image-caption", title: "T", imageUrl: "/\\evil.com/x.png", caption: "c" });
    expect(data().slides[first].html).not.toContain("<img");
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, layout: "image-caption", title: "T", imageUrl: "https://ok.example/a.png", caption: "c" });
    expect(data().slides[first].html).toContain('<img src="https://ok.example/a.png"');
  });
});

describe("S4 prototype-key ids", () => {
  it("does not resolve inherited keys as slides", () => {
    const { board, deck, first, data } = setup();
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const result = applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: id, name: "x" });
      expect(result.ids).toEqual([]);
    }
    expect(applyAgentAction(board, { type: "reorder_slides", blockId: deck, slideOrder: ["toString"] }).ids).toEqual([]);
    expect(Object.keys(data().slides)).toEqual([first]);
    expect(normalizeSlideDeckData({ slideOrder: ["constructor"], slides: {} }).slideOrder).not.toContain("constructor");
  });
  it("ignores a block id such as constructor", () => {
    const { board } = setup();
    expect(applyAgentAction(board, { type: "update_slide", blockId: "constructor", slideId: "x", name: "y" }).ids).toEqual([]);
  });
});

describe("S5 alt text escaping", () => {
  it("escapes a quote/angle caption once", () => {
    const { board, deck, first, data } = setup();
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, layout: "image-caption", title: "T", imageUrl: "https://ok.example/a.png", caption: '"><b>x' });
    expect(data().slides[first].html).toContain('alt="&quot;&gt;&lt;b&gt;x"');
    expect(data().slides[first].html).not.toContain("&amp;gt;");
  });
});

describe("S6 ignored backgroundColor note", () => {
  it("explains that backgroundColor needs applyToAll", () => {
    const { board, deck } = setup();
    const result = applyAgentAction(board, { type: "update_slide_deck", blockId: deck, title: "T", backgroundColor: "#000000" });
    expect(result.ids).toEqual([deck]);
    expect(result.notes?.join(" ")).toMatch(/backgroundColor was ignored/);
  });
});

describe("S7 present index", () => {
  const deck = (hidden: string[]): SlideDeckPayload => ({
    slideOrder: ["a", "b", "c", "d"], aspectRatio: "16:9", activeSlideId: "b",
    slides: Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { id, name: id, html: "", ...(hidden.includes(id) ? { hidden: true } : {}) }])),
  });
  it("starts at the nearest following visible slide when the active one is hidden", () => {
    const data = deck(["b", "c"]);
    expect(presentStartIndex(data, presentableSlideOrder(data))).toBe(1);
    expect(presentableSlideOrder(data)[1]).toBe("d");
  });
  it("falls back to the last visible slide when none follows", () => {
    const data = { ...deck(["b", "c", "d"]) };
    expect(presentStartIndex(data, presentableSlideOrder(data))).toBe(0);
    const tail = { ...deck(["c", "d"]), activeSlideId: "d" };
    expect(presentStartIndex(tail, presentableSlideOrder(tail))).toBe(1);
  });
  it("starts at the active slide when visible", () => {
    const data = deck(["a"]);
    expect(presentStartIndex(data, presentableSlideOrder(data))).toBe(0);
  });
  it("clamps an index past the end", () => {
    expect(clampPresentIndex(7, 3)).toBe(2);
    expect(clampPresentIndex(-1, 3)).toBe(0);
    expect(clampPresentIndex(2, 0)).toBe(0);
  });
});
