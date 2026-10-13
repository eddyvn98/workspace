// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...args: unknown[]) => warning(...args), error: vi.fn(), success: vi.fn() } }));

import { mergeBoardContent } from "@/app/workspace/utils/mergeBoardConflict";
import { buildConflictNotice, describeConflictEntity, describeEditor } from "@/app/workspace/utils/conflictNotice";
import { notifyMergeConflicts, restoreMergeConflicts } from "@/app/workspace/utils/restoreMergeConflicts";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";

const block = (id: string, markdown: string, extra: object = {}) => ({ id, type: "text", data: { markdown }, ...extra });
const content = (blocks: Record<string, unknown>, order: string[]) => ({ blocks, blockOrder: order, connectors: {} });

describe("merge conflict details", () => {
  it("returns the local value that lost, with the server value that won", () => {
    const base = content({ a: block("a", "A") }, ["a"]);
    const mine = content({ a: block("a", "A_ME") }, ["a"]);
    const theirs = content({ a: block("a", "A_AI", { lastEditedBy: "ai@example.com" }) }, ["a"]);
    const merged = mergeBoardContent(base, mine, theirs);
    expect(merged.conflicts).toBe(1);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]).toMatchObject({ kind: "block", id: "a", mine: { data: { markdown: "A_ME" } }, theirs: { data: { markdown: "A_AI" } } });
  });

  it("reports an edit the other side deleted", () => {
    const base = content({ a: block("a", "A") }, ["a"]);
    const merged = mergeBoardContent(base, content({ a: block("a", "A_ME") }, ["a"]), content({}, []));
    expect(merged.items[0]).toMatchObject({ id: "a", theirs: undefined });
    expect(buildConflictNotice(merged.items).description).toContain("(deleted)");
  });
});

describe("conflict notice text", () => {
  it("names the block, strips html, shortens long text and names who won", () => {
    expect(describeConflictEntity("block", block("a", "Alpha"))).toBe('"Alpha"');
    expect(describeConflictEntity("block", { type: "doc", data: { html: "<h1>Plan</h1><p>Q1&nbsp;goals</p>" } })).toBe('"Plan Q1 goals"');
    expect(describeConflictEntity("block", block("a", "x".repeat(80))).length).toBeLessThan(46);
    expect(describeConflictEntity("block", { type: "image", data: {} })).toBe("a image");
    expect(describeConflictEntity("connector", { label: "next" })).toBe('connector "next"');
    expect(describeEditor({ lastEditedBy: "ana@example.com" })).toBe("ana@example.com");
    expect(describeEditor({})).toBe("another editor");
  });

  it("summarises several edits and lists at most three", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ kind: "block" as const, id, mine: block(id, id.toUpperCase()), theirs: block(id, "z", { lastEditedBy: "ana@example.com" }) }));
    const notice = buildConflictNotice(items);
    expect(notice.title).toBe("5 of your edits were replaced");
    expect(notice.description).toContain('"A", "B", "C" and 2 more');
    expect(notice.description).toContain("ana@example.com");
    expect(buildConflictNotice(items.slice(0, 1)).title).toBe("Your edit was replaced");
  });
});

describe("restoring lost edits", () => {
  beforeEach(() => {
    warning.mockClear();
    useWorkspaceStore.setState({ blocks: { a: block("a", "A_AI") } as never, blockOrder: ["a"], connectors: {} as never });
  });

  it("offers a Restore action that puts the local version back on the board", () => {
    const item = { kind: "block" as const, id: "a", mine: block("a", "A_ME"), theirs: block("a", "A_AI") };
    notifyMergeConflicts([item]);
    expect(warning).toHaveBeenCalledTimes(1);
    const [title, options] = warning.mock.calls[0] as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(title).toBe("Your edit was replaced");
    expect(options.action.label).toBe("Restore mine");
    options.action.onClick();
    expect((useWorkspaceStore.getState().blocks as Record<string, any>).a.data.markdown).toBe("A_ME");
  });

  it("re-adds a block the other side deleted and removes one the user had deleted", () => {
    useWorkspaceStore.setState({ blocks: {} as never, blockOrder: [] });
    restoreMergeConflicts([{ kind: "block", id: "a", mine: block("a", "A_ME"), theirs: undefined }]);
    expect(useWorkspaceStore.getState().blockOrder).toEqual(["a"]);
    restoreMergeConflicts([{ kind: "block", id: "a", mine: undefined, theirs: block("a", "A_AI") }]);
    expect(useWorkspaceStore.getState().blockOrder).toEqual([]);
    expect(useWorkspaceStore.getState().blocks).toEqual({});
  });

  it("shows nothing when there is no conflict", () => {
    notifyMergeConflicts([]);
    expect(warning).not.toHaveBeenCalled();
  });
});
