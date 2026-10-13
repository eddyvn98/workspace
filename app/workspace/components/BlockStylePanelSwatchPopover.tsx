"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export const BG_SWATCHES = [
  "#ffffff",
  "#f1f5f9",
  "#fee2e2",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
];

export const BORDER_SWATCHES = [
  "#cbd5e1",
  "#1e293b",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
];

export const TEXT_COLOR_SWATCHES = [
  "#1e293b",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ffffff",
];

export const ICON_OPTIONS = [
  "🚀",
  "⭐",
  "✅",
  "⚠️",
  "🔥",
  "💡",
  "📌",
  "🎯",
  "❤️",
  "📝",
];

export type PopoverKey = "bg" | "border" | "textColor" | "path" | "icon" | "fontSize" | "align" | null;

export function SwatchButton({
  isDefault,
  isSelected,
  label,
  color,
  emoji,
  onClick,
}: {
  isDefault?: boolean;
  isSelected: boolean;
  label: string;
  color?: string;
  emoji?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={color ? { backgroundColor: color } : undefined}
      className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full border transition hover:scale-110 cursor-pointer ${
        isDefault
          ? "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
          : "border-black/10 dark:border-white/20"
      } ${
        emoji ? "text-[11px] leading-none" : ""
      } ${isSelected ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
    >
      {isDefault ? <div className="h-full w-0.5 rotate-45 bg-red-400" /> : emoji ?? null}
    </button>
  );
}

export function SwatchRow({
  options,
  current,
  onPick,
  ariaPrefix,
}: {
  options: string[];
  current: string | undefined;
  onPick: (value: string | undefined) => void;
  ariaPrefix: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <SwatchButton
        isDefault
        isSelected={current === undefined}
        label={`Default ${ariaPrefix}`}
        onClick={() => onPick(undefined)}
      />
      {options.map((value) => (
        <SwatchButton
          key={value}
          color={value.startsWith("#") ? value : undefined}
          emoji={value.startsWith("#") ? undefined : value}
          isSelected={current === value}
          label={`${ariaPrefix} ${value}`}
          onClick={() => onPick(value)}
        />
      ))}
    </div>
  );
}

export interface SwatchPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  showTitle?: boolean;
  placeBelow?: boolean;
  allowOverflow?: boolean;
  children: React.ReactNode;
}

export function SwatchPopover({
  isOpen,
  onClose,
  title,
  showTitle = true,
  placeBelow = false,
  allowOverflow = false,
  children,
}: SwatchPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [resolvedPlaceBelow, setResolvedPlaceBelow] = useState(placeBelow);

  useLayoutEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const reposition = () => {
      const popover = popoverRef.current;
      const anchor = popover?.parentElement;
      if (!popover || !anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverHeight = popover.getBoundingClientRect().height;
      const gap = 8;
      const margin = 8;
      const fitsAbove = anchorRect.top - gap - popoverHeight >= margin;
      const fitsBelow = anchorRect.bottom + gap + popoverHeight <= window.innerHeight - margin;
      const nextPlaceBelow = placeBelow ? (!fitsBelow && fitsAbove ? false : true) : (!fitsAbove && fitsBelow);
      setResolvedPlaceBelow((current) => current === nextPlaceBelow ? current : nextPlaceBelow);
      frame = requestAnimationFrame(reposition);
    };
    frame = requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, placeBelow]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        const trigger = popoverRef.current.parentElement;
        if (trigger && trigger.contains(e.target as Node)) {
          return;
        }
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute z-50 flex max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)] flex-col gap-1.5 ${allowOverflow ? "overflow-visible" : "overflow-y-auto"} rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none ${
        resolvedPlaceBelow
          ? "top-full mt-2 left-1/2 -translate-x-1/2"
          : "bottom-full mb-2 left-1/2 -translate-x-1/2"
      }`}
    >
      {showTitle && <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </span>
        </div>}
      {children}
    </div>
  );
}
