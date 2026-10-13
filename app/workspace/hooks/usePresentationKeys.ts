"use client";
import { useEffect } from "react";

export function usePresentationKeys(active: boolean, next: () => void, prev: () => void, exit: () => void, jump: (index: number) => void, total: number) {
  useEffect(() => {
    if (!active) return;
    const handle = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const action = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key) ? next
        : ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) ? prev
        : event.key === "Escape" ? exit : event.key === "Home" ? () => jump(0)
        : event.key === "End" ? () => jump(total - 1) : undefined;
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      action();
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [active, next, prev, exit, jump, total]);
}
