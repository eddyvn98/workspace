// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

const TABLE_NODE = '<div data-workspace-table="true" data-table-id="t1"></div>';
const STORED = [
  '<h1 data-line-id="l-h1">Plan</h1>',
  '<p data-line-id="l-p1">Intro text</p>',
  '<h2 data-line-id="l-h2">Tasks</h2>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="false" data-line-id="l-t1"><p>First</p></li></ul>',
  TABLE_NODE,
  '<h2 data-line-id="l-h3">Notes</h2>',
  '<p data-line-id="l-p2">Alpha beta &amp; gamma</p>',
].join("");

function board(html = STORED): AgentBoardState {
  return {
    title: "t", blockOrder: ["doc", "t1"], connectors: {},
    blocks: {
      doc: { id: "doc", type: "doc", data: { html } },
      t1: { id: "t1", type: "table", embeddedInDocId: "doc", data: { rows: 1, cols: 1, cells: [["x"]] } },
      t2: { id: "t2", type: "table", data: { rows: 1, cols: 1, cells: [["y"]] } },
      t3: { id: "t3", type: "table", embeddedInDocId: "other", data: { rows: 1, cols: 1, cells: [["z"]] } },
    },
  };
}
/** Simulates persistence: the board is saved as JSON and loaded again. */
const reload = (state: AgentBoardState): AgentBoardState => JSON.parse(JSON.stringify(state));
const html = (state: AgentBoardState) => String(state.blocks.doc.data.html);

describe("update_node markdown on a doc", () => {
  it("rewrites the doc through the markdown path and survives a reload", () => {
    const state = board("<p>old</p>");
    const result = applyAgentAction(state, { type: "update_node", blockId: "doc", markdown: "# New\n\n- a\n- b" });
    expect(result.ids).toEqual(["doc"]);
    const saved = reload(state);
    expect(html(saved)).toBe("<h1>New</h1><ul><li><p>a</p></li><li><p>b</p></li></ul>");
    expect(saved.blocks.doc.data.markdown).toBeUndefined();
  });

  it("does not hijack markdown updates of plain text blocks", () => {
    const state = board();
    state.blocks.note = { id: "note", type: "text", data: { markdown: "old" } };
    applyAgentAction(state, { type: "update_node", blockId: "note", markdown: "new" });
    expect(state.blocks.note.data.markdown).toBe("old");
  });
});

describe("partial doc edits", () => {
  it("appends markdown without touching existing nodes, lineIds or embedded tables", () => {
    const state = board();
    const result = applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "append", markdown: "## Next\n\n- [ ] ship" });
    expect(result.ids).toEqual(["doc"]);
    const saved = html(reload(state));
    expect(saved.startsWith(STORED)).toBe(true);
    expect(saved).toContain('<h2>Next</h2><ul data-type="taskList">');
  });

  it("prepends html", () => {
    const state = board();
    applyAgentAction(state, { type: "update_node", blockId: "doc", mode: "prepend", html: "<p>Top</p>" });
    expect(html(state)).toBe(`<p>Top</p>${STORED}`);
  });

  it("appends at the end of a heading section by default and prepends right after the heading", () => {
    const state = board();
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", afterHeading: "tasks", markdown: "more" });
    expect(html(state)).toContain(`${TABLE_NODE}<p>more</p><h2 data-line-id="l-h3">Notes</h2>`);
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "prepend", afterHeading: "Tasks", markdown: "lead" });
    expect(html(state)).toContain('Tasks</h2><p>lead</p><ul data-type="taskList">');
    expect(html(state)).toContain('data-line-id="l-t1"');
  });

  it("replaces a heading section body, keeps the heading and the embedded table", () => {
    const state = board();
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "replace", afterHeading: "Tasks", markdown: "## Tasks\n\nNothing left" });
    const saved = html(reload(state));
    expect(saved).toContain('<h2 data-line-id="l-h2">Tasks</h2><p>Nothing left</p>' + TABLE_NODE + '<h2 data-line-id="l-h3">Notes</h2>');
    expect(saved).not.toContain("First");
    expect(saved).toContain('data-line-id="l-p2"');
  });

  it("targets a line by lineId for replace, append and prepend", () => {
    const state = board();
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "replace", lineId: "l-p1", markdown: "Replaced" });
    expect(html(state)).toContain('<h1 data-line-id="l-h1">Plan</h1><p>Replaced</p><h2 data-line-id="l-h2">');
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "prepend", lineId: "l-h3", html: "<hr>" });
    expect(html(state)).toContain(`<hr><h2 data-line-id="l-h3">Notes</h2>`);
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", lineId: "l-p2", markdown: "Tail" });
    expect(html(state).endsWith("</p><p>Tail</p>")).toBe(true);
  });

  it("adds a sibling list item after a task item and reports a missing anchor as no change", () => {
    const state = board();
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", lineId: "l-t1", markdown: "- Second" });
    expect(html(state)).toContain('<li data-type="taskItem" data-checked="false"><p>Second</p></li></ul>');
    expect(applyAgentAction(state, { type: "update_rich_text", blockId: "doc", lineId: "nope", markdown: "x" }).ids).toEqual([]);
    expect(applyAgentAction(state, { type: "update_rich_text", blockId: "doc", afterHeading: "Missing", markdown: "x" }).ids).toEqual([]);
  });
});

describe("update_rich_text query edits", () => {
  it("marks every match in text nodes only, never tag names or attributes", () => {
    const state = board('<p data-line-id="p">pa p</p><a href="https://p.example/p">pp</a>');
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", query: "p", marks: { bold: true } });
    const saved = html(reload(state));
    expect(saved).toContain('<p data-line-id="p"><strong>p</strong>a <strong>p</strong></p>');
    expect(saved).toContain('href="https://p.example/p"');
    expect(saved).toContain("<a href=\"https://p.example/p\"><strong>p</strong><strong>p</strong></a>");
  });

  it("honors replaceAll=false, strike, code, underline and a safe link", () => {
    const state = board("<p>one one one</p>");
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", query: "one", replaceAll: false, marks: { strike: true, code: true, underline: true, link: "https://example.com/a?b=1&c=2" } });
    expect(html(state)).toBe('<p><a href="https://example.com/a?b=1&amp;c=2"><u><s><code>one</code></s></u></a> one one</p>');
  });

  it("ignores javascript links and supports mailto", () => {
    const state = board("<p>mail me</p>");
    expect(applyAgentAction(state, { type: "update_rich_text", blockId: "doc", query: "mail", marks: { link: "javascript:alert(1)" } }).ids).toEqual([]);
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", query: "mail", marks: { link: "mailto:a@b.co" } });
    expect(html(state)).toContain('<a href="mailto:a@b.co">mail</a>');
  });

  it("can replace text while marking it and keeps entities escaped", () => {
    const state = board("<p>A &amp; B</p>");
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", query: "a & b", replacement: "C <D>", marks: { italic: true } });
    expect(html(state)).toBe("<p><em>C &lt;D&gt;</em></p>");
  });
});

describe("search_replace on doc blocks", () => {
  it("replaces in text nodes with replaceAll default and leaves markup alone", () => {
    const state = board();
    const result = applyAgentAction(state, { type: "search_replace", query: "alpha", replacement: "Omega" });
    expect(result.ids).toEqual(["doc"]);
    expect(html(reload(state))).toContain('<p data-line-id="l-p2">Omega beta &amp; gamma</p>');
    expect(applyAgentAction(state, { type: "search_replace", query: "data-line-id", replacement: "x" }).ids).toEqual([]);
    expect(applyAgentAction(state, { type: "search_replace", query: "table", replacement: "x" }).ids).toEqual([]);
  });

  it("replaces only the first match when replaceAll is false", () => {
    const state = board("<p>ab ab</p><p>ab</p>");
    applyAgentAction(state, { type: "search_replace", blockId: "doc", query: "ab", replacement: "X", replaceAll: false });
    expect(html(state)).toBe("<p>X ab</p><p>ab</p>");
  });
});

describe("alignment in doc html", () => {
  it("keeps text-align from html on create and update", () => {
    const state = board("<p>x</p>");
    applyAgentAction(state, { type: "update_node", blockId: "doc", html: '<h2 style="text-align:center;color:red">T</h2><p style="text-align:right">r</p>' });
    expect(html(reload(state))).toBe('<h2 style="text-align: center">T</h2><p style="text-align: right">r</p>');
    const created = applyAgentAction(state, { type: "create_block", blockType: "doc", data: { html: '<p style="text-align:justify">j</p>' } });
    expect(String(state.blocks[created.ids[0]].data.html)).toBe('<p style="text-align: justify">j</p>');
  });
});

describe("embed_table_in_doc", () => {
  it("sets embeddedInDocId and appends the node, persisted across a reload", () => {
    const state = board("<h2>Data</h2><p>x</p>");
    const result = applyAgentAction(state, { type: "embed_table_in_doc", docId: "doc", tableId: "t2" });
    expect(result.ids).toEqual(["doc", "t2"]);
    const saved = reload(state);
    expect(saved.blocks.t2.embeddedInDocId).toBe("doc");
    expect(html(saved)).toBe('<h2>Data</h2><p>x</p><div data-workspace-table="true" data-table-id="t2"></div>');
  });

  it("inserts at the end of the section after a heading and accepts blockId for the doc", () => {
    const state = board("<h2>Data</h2><p>x</p><h2>More</h2><p>y</p>");
    applyAgentAction(state, { type: "embed_table_in_doc", blockId: "doc", tableId: "t2", afterHeading: "Data" });
    expect(html(state)).toBe('<h2>Data</h2><p>x</p><div data-workspace-table="true" data-table-id="t2"></div><h2>More</h2><p>y</p>');
  });

  it("rejects missing blocks, wrong types, tables embedded elsewhere and repeats", () => {
    const state = board();
    const before = JSON.stringify(state);
    for (const action of [
      { docId: "nope", tableId: "t2" }, { docId: "doc", tableId: "nope" }, { docId: "t2", tableId: "t2" },
      { docId: "doc", tableId: "doc" }, { docId: "doc", tableId: "t3" }, { docId: "doc", tableId: "t1" },
      { docId: "doc", tableId: "t2", afterHeading: "Missing" },
    ]) expect(applyAgentAction(state, { type: "embed_table_in_doc", ...action }).ids).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("repairs a table whose node is already in the doc but is not marked embedded", () => {
    const state = board();
    delete state.blocks.t1.embeddedInDocId;
    expect(applyAgentAction(state, { type: "embed_table_in_doc", docId: "doc", tableId: "t1" }).ids).toEqual(["doc", "t1"]);
    expect(state.blocks.t1.embeddedInDocId).toBe("doc");
    expect(html(state).split("data-table-id=\"t1\"").length).toBe(2);
  });

  it("keeps embedded tables when the whole document is rewritten", () => {
    const state = board();
    applyAgentAction(state, { type: "update_node", blockId: "doc", markdown: "# New plan\n\nFresh text" });
    const html = (state.blocks.doc.data as { html: string }).html;
    expect(html).toContain("New plan");
    expect(html).not.toContain("Intro text");
    expect(html).toContain('data-table-id="t1"');
  });

  it("cannot break out of an attribute through a markdown image or link target", () => {
    const state = board("<p>x</p>");
    applyAgentAction(state, { type: "update_node", blockId: "doc", markdown: '![a](x"onerror="alert(1) and [b](javascript:alert(1))' });
    const html = (state.blocks.doc.data as { html: string }).html;
    expect(html).not.toMatch(/onerror\s*=/i);
    expect(html).not.toMatch(/href="javascript:/i);
  });
});
