"use client";

import React, { useRef, useLayoutEffect, useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface WorkspaceSmartPopoverProps {
  children: React.ReactNode;
  className?: string;
  defaultH?: "left" | "right" | "center";
  onClose?: () => void;
}

export function WorkspaceSmartPopover({ children, className = "", defaultH = "left", onClose }: WorkspaceSmartPopoverProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({ visibility: "hidden", position: "fixed", top: 0, left: 0, maxHeight: "calc(100vh - 16px)", overflowY: "auto" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      const content = contentRef.current;
      const placeholder = placeholderRef.current;
      const anchor = placeholder?.parentElement;
      if (content && !content.contains(event.target as Node) && (!anchor || !anchor.contains(event.target as Node))) onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [mounted, onClose]);

  useLayoutEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const reposition = () => {
      const placeholder = placeholderRef.current;
      const content = contentRef.current;
      const anchor = placeholder?.parentElement as HTMLElement | null;
      if (anchor && content) {
        const anchorRect = anchor.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const elW = contentRect.width || 240;
        const elH = contentRect.height || 220;
        const style: React.CSSProperties = { position: "fixed", visibility: "visible", overflowY: "auto" };
        const availableBelow = window.innerHeight - anchorRect.bottom - 6;
        const availableAbove = anchorRect.top - 6;
        const placeBelow = availableBelow >= elH || availableBelow >= availableAbove;
        style.maxHeight = `${Math.max(120, Math.floor(placeBelow ? availableBelow : availableAbove))}px`;
        if (placeBelow) style.top = anchorRect.bottom + 6;
        else style.bottom = window.innerHeight - anchorRect.top + 6;
        const idealLeft = defaultH === "right"
          ? anchorRect.right - elW
          : defaultH === "center"
            ? anchorRect.left + anchorRect.width / 2 - elW / 2
            : anchorRect.left;
        style.left = Math.max(8, Math.min(idealLeft, window.innerWidth - elW - 8));
        setPortalStyle((previous) => previous.top === style.top && previous.bottom === style.bottom && previous.left === style.left && previous.visibility === style.visibility && previous.position === style.position ? previous : style);
      }
      frame = requestAnimationFrame(reposition);
    };
    frame = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(frame);
  }, [mounted, defaultH, children]);

  return (
    <>
      <div ref={placeholderRef} style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none", visibility: "hidden" }} />
      {mounted && createPortal(
        <div ref={contentRef} data-mindmap-wheel-lock="true" onWheel={(event) => event.stopPropagation()} className={`z-[9999] ${className}`} style={portalStyle}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
