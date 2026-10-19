// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpreadsheetFlush } from "@/app/workspace/components/table/useSpreadsheetFlush";
import { flushWorkspaceEditors } from "@/app/workspace/utils/workspaceEditorFlush";
afterEach(cleanup);
it("commits a dirty formula bar before draining the callback and board save", async () => {
  const root = document.createElement("section"), input = document.createElement("div");
  input.className = "fortune-fx-input"; root.append(input);
  vi.spyOn(input, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  const order: string[] = [], changes = vi.fn();
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") order.push("commit"); });
  const emitNow = () => { order.push("emit"); };
  const { result } = renderHook(() => useSpreadsheetFlush({ boardId: "flush-test", root: { current: root }, emitNow, onDirtyChange: changes }));
  act(() => result.current.markDirty(input));
  await act(async () => { expect(await flushWorkspaceEditors("flush-test")).toBe(true); });
  expect(order).toEqual(["commit", "emit"]); expect(changes.mock.calls.map((x) => x[0])).toEqual([true, false]);
});
