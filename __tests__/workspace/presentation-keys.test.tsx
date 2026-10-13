// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { usePresentationKeys } from "@/app/workspace/hooks/usePresentationKeys";

function Keys({ active, next, prev, exit, jump }: { active: boolean; next: () => void; prev: () => void; exit: () => void; jump: (index: number) => void }) {
  usePresentationKeys(active, next, prev, exit, jump, 3); return null;
}
it("presentation takes navigation before canvas; inactive frames never steal keys", () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const next = vi.fn(), prev = vi.fn(), exit = vi.fn(), jump = vi.fn(), canvas = vi.fn();
  window.addEventListener("keydown", canvas);
  act(() => root.render(<Keys active={false} next={next} prev={prev} exit={exit} jump={jump} />));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
  expect(next).not.toHaveBeenCalled(); expect(canvas).toHaveBeenCalledOnce(); canvas.mockClear();
  act(() => root.render(<Keys active next={next} prev={prev} exit={exit} jump={jump} />));
  for (const key of ["ArrowRight", "PageDown", " ", "ArrowLeft", "Home", "End", "Escape"]) window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
  expect(next).toHaveBeenCalledTimes(3); expect(prev).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce();
  expect(jump.mock.calls).toEqual([[0], [2]]); expect(canvas).not.toHaveBeenCalled();
  const input = document.createElement("textarea"); document.body.append(input);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(next).toHaveBeenCalledTimes(3);
  act(() => root.unmount()); input.remove(); host.remove(); window.removeEventListener("keydown", canvas);
});
