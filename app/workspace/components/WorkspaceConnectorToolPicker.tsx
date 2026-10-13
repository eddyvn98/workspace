"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

interface ConnectorToolOption {
  id: string;
  label: string;
  lineType: "straight" | "curved" | "orthogonal";
  arrowEnd: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

function ConnectorIcon({ kind, className }: { kind: "straight" | "straight_arrow" | "orthogonal" | "curved"; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "straight") return <svg {...common}><line x1="3" y1="21" x2="21" y2="3" /></svg>;
  if (kind === "straight_arrow") return <svg {...common}><line x1="5" y1="19" x2="19" y2="5" /><polyline points="12 5 19 5 19 12" /></svg>;
  if (kind === "orthogonal") return <svg {...common}><path d="M4 18h4a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h4" /></svg>;
  return <svg {...common}><path d="M4 18c4-4 8-12 16-12" /></svg>;
}

const CONNECTOR_OPTIONS: ConnectorToolOption[] = [
  {
    id: "straight",
    label: "Straight line",
    lineType: "straight",
    arrowEnd: false,
    Icon: (props) => <ConnectorIcon kind="straight" {...props} />,
  },
  {
    id: "straight_arrow",
    label: "Straight arrow",
    lineType: "straight",
    arrowEnd: true,
    Icon: (props) => <ConnectorIcon kind="straight_arrow" {...props} />,
  },
  {
    id: "orthogonal",
    label: "Orthogonal (elbow)",
    lineType: "orthogonal",
    // The legacy relationship picker only adds an arrow for the explicit
    // "straight arrow" option; curved and orthogonal start undecorated.
    arrowEnd: false,
    Icon: (props) => <ConnectorIcon kind="orthogonal" {...props} />,
  },
  {
    id: "curved",
    label: "Curved connector",
    lineType: "curved",
    arrowEnd: false,
    Icon: (props) => <ConnectorIcon kind="curved" {...props} />,
  },
];

function DefaultConnectorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || "h-4 w-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 18h4a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h4" />
      <polyline points="15 3 18 6 15 9" />
    </svg>
  );
}

export function WorkspaceConnectorToolPicker({ compact = false }: { compact?: boolean }) {
  const activeConnectorTool = useWorkspaceStore((state) => state.activeConnectorTool);
  const setActiveConnectorTool = useWorkspaceStore((state) => state.setActiveConnectorTool);
  const setIsDrawMode = useWorkspaceStore((state) => state.setIsDrawMode);
  const setArmedShapeKind = useWorkspaceStore((state) => state.setArmedShapeKind);
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveConnectorTool(null);
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveConnectorTool]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const activeOption = activeConnectorTool
    ? CONNECTOR_OPTIONS.find(
        (opt) =>
          opt.lineType === activeConnectorTool.lineType &&
          opt.arrowEnd === activeConnectorTool.arrowEnd
      )
    : null;

  const TriggerIcon = activeOption ? activeOption.Icon : DefaultConnectorIcon;

  const handleSelectOption = (opt: ConnectorToolOption) => {
    if (
      activeConnectorTool &&
      activeConnectorTool.lineType === opt.lineType &&
      activeConnectorTool.arrowEnd === opt.arrowEnd
    ) {
      setActiveConnectorTool(null);
    } else {
      setActiveConnectorTool({ lineType: opt.lineType, arrowEnd: opt.arrowEnd });
      setIsDrawMode(false);
      setArmedShapeKind(null);
    }
  };

  const handleTriggerPointerDown = () => {
    if (activeConnectorTool) {
      setActiveConnectorTool(null);
    } else {
      setActiveConnectorTool({ lineType: "curved", arrowEnd: false });
      setIsDrawMode(false);
      setArmedShapeKind(null);
    }
  };

  return (
    <div
      ref={pickerRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
        <button
          type="button"
          onPointerDown={handleTriggerPointerDown}
          onClick={() => setIsOpen(true)}
          onFocus={() => setIsOpen(true)}
          title={
            activeOption
              ? `Create relationship connection: ${activeOption.label} (click to change or toggle off)`
              : "Create Relationship Connection"
          }
          aria-label="Create relationship connection"
          aria-pressed={activeConnectorTool !== null}
          className={
            compact
              ? `flex h-8 w-8 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${
                  activeConnectorTool
                    ? "bg-orange-500 text-white hover:bg-orange-600 hover:text-white shadow-md shadow-orange-500/20"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`
              : `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${
                  activeConnectorTool
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`
          }
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <TriggerIcon className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
          {!compact && <span>Connector</span>}
        </button>
      {isOpen && <div
        role="menu"
        className={compact
          ? "absolute left-full top-0 ml-2 flex min-w-0 w-auto items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
          : "absolute left-0 top-full z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"}
      >
        {!compact && (
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
            Connector Line Type
          </div>
        )}
        <div className={compact ? "flex items-center gap-1" : "mt-1 space-y-0.5"}>
          {CONNECTOR_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const isActive =
              activeConnectorTool !== null &&
              activeConnectorTool.lineType === opt.lineType &&
              activeConnectorTool.arrowEnd === opt.arrowEnd;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectOption(opt)}
                aria-label={compact ? `Draw ${opt.label.toLowerCase()} relationship` : opt.label}
                title={compact ? `Draw ${opt.label.toLowerCase()} relationship` : undefined}
                className={`${compact
                  ? "flex min-w-8 items-center justify-center rounded-xl p-2 text-xs transition-colors cursor-pointer"
                  : "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer"} ${
                  isActive
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`${compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} ${isActive ? "text-orange-600 dark:text-orange-400" : ""}`} />
                  {!compact && <span>{opt.label}</span>}
                </div>
                {!compact && isActive && <Check className="h-3.5 w-3.5 stroke-[2.5] text-orange-600 dark:text-orange-400" />}
              </button>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

export default WorkspaceConnectorToolPicker;
