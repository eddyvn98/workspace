"use client";
import { useEffect, useRef, type Dispatch, type SetStateAction, type MouseEvent, type TouchEvent } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export function useWorkspaceChatPanelLayout(visible: boolean, width: number, setWidth: Dispatch<SetStateAction<number>>, onClose?: () => void, onResizeEnd?: (width: number) => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const touch = useRef({ start: 0, current: 0 });
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelResize = useRef<() => void>();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-workspace-root]");
    root?.style.setProperty("--workspace-chat-width", `${visible ? width : 0}px`);
    useWorkspaceStore.getState().setChatPanelWidth(visible ? width : 0);
    return () => {
      root?.style.setProperty("--workspace-chat-width", "0px");
      useWorkspaceStore.getState().setChatPanelWidth(0);
    };
  }, [visible, width]);
  useEffect(() => { if (visible) inputRef.current?.focus(); }, [visible]);
  useEffect(() => {
    if (!visible || !onClose) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, onClose]);
  useEffect(() => () => {
    cancelResize.current?.(); clearTimeout(transitionTimer.current);
    touch.current = { start: 0, current: 0 };
    if (panelRef.current) { panelRef.current.style.transform = ""; panelRef.current.style.transition = ""; }
  }, [visible]);
  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    touch.current = { start: event.touches[0].clientY, current: event.touches[0].clientY };
    if (panelRef.current) panelRef.current.style.transition = "none";
  };
  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    touch.current.current = event.touches[0].clientY;
    if (panelRef.current) panelRef.current.style.transform = `translateY(${touch.current.current - touch.current.start}px)`;
  };
  const handleTouchEnd = () => {
    if (touch.current.current - touch.current.start > 100) onClose?.();
    if (panelRef.current) {
      panelRef.current.style.transition = "transform 0.3s ease-out";
      panelRef.current.style.transform = "";
      clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => { if (panelRef.current) panelRef.current.style.transition = ""; }, 300);
    }
    touch.current = { start: 0, current: 0 };
  };
  const handleResizeStart = (event: MouseEvent) => {
    event.preventDefault(); cancelResize.current?.();
    const x = event.clientX, initialWidth = panelRef.current?.offsetWidth || width;
    const move = (next: globalThis.MouseEvent) => setWidth(Math.min(600, Math.max(240, initialWidth + x - next.clientX)));
    const cleanup = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", end); cancelResize.current = undefined; };
    const end = () => { cleanup(); if (panelRef.current) onResizeEnd?.(panelRef.current.offsetWidth); };
    cancelResize.current = cleanup;
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", end);
  };
  return { panelRef, inputRef, handleTouchStart, handleTouchMove, handleTouchEnd, handleResizeStart };
}
