// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useDocEditorSynchronization } from "@/app/workspace/hooks/useDocEditorSynchronization";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

it("dispatches outside React effects, cancels stale updates and skips the editor's own typing", async () => {
  const editor = { isDestroyed: false, isEditable: false, setEditable: vi.fn(), getHTML: vi.fn(() => "old"), commands: { focus: vi.fn(), setContent: vi.fn() } };
  const publish = vi.fn(), emitted = { current: "old" };
  function Host({ html }: { html: string }) { useDocEditorSynchronization(editor as never, html, true, emitted, publish); return null; }
  const element = document.createElement("div"), root = createRoot(element);
  try {
    act(() => root.render(<Host html="stale" />));
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    act(() => root.render(<Host html="latest" />));
    await act(async () => { await Promise.resolve(); });
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
    expect(editor.commands.setContent).toHaveBeenCalledWith("latest", { emitUpdate: false });
    emitted.current = "own keystroke";
    act(() => root.render(<Host html="own keystroke" />));
    await act(async () => { await Promise.resolve(); });
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
    act(() => root.render(<Host html="pending" />));
    act(() => root.unmount());
    await act(async () => { await Promise.resolve(); });
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
  } finally { if (element.childNodes.length) act(() => root.unmount()); }
});

it("never dispatches into an editor destroyed before synchronization", async () => {
  const editor = { isDestroyed: true, commands: { setContent: vi.fn(), focus: vi.fn() } };
  function Host() { useDocEditorSynchronization(editor as never, "new", true, { current: "old" }, vi.fn()); return null; }
  const root = createRoot(document.createElement("div"));
  await act(async () => { root.render(<Host />); });
  expect(editor.commands.setContent).not.toHaveBeenCalled(); expect(editor.commands.focus).not.toHaveBeenCalled();
  act(() => root.unmount());
});
