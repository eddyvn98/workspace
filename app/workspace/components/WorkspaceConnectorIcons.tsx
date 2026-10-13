"use client";

import React from "react";

export const WORKSPACE_SOLID_COLORS = [
  { name: "Black", value: "#000000" }, { name: "Gray", value: "#64748b" }, { name: "Purple", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" }, { name: "Green", value: "#16a34a" }, { name: "Yellow", value: "#eab308" },
  { name: "Orange", value: "#f97316" }, { name: "Red", value: "#ef4444" },
];

export function getLineTypeIcon(type: "straight" | "orthogonal" | "curved" | "straight_arrow", className = "w-6 h-3") {
  if (type === "orthogonal") return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 2H12V10H22" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (type === "curved") return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 2C10 2 14 10 22 10" strokeLinecap="round" /></svg>;
  return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="6" x2={type === "straight_arrow" ? "20" : "22"} y2="6" strokeLinecap="round" />{type === "straight_arrow" && <path d="M16 3L20 6L16 9" fill="none" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
}

export function getMapLineStyleIcon(type: "curved" | "orthogonal" | "straight", className = "h-9 w-16") {
  const common = { className, viewBox: "0 0 64 32", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const nodes = <><rect x="2" y="13" width="5" height="6" rx="1" fill="currentColor" stroke="none" /><rect x="56" y="2" width="6" height="6" rx="1" fill="currentColor" opacity="0.65" stroke="none" /><rect x="56" y="13" width="6" height="6" rx="1" fill="currentColor" opacity="0.65" stroke="none" /><rect x="56" y="24" width="6" height="6" rx="1" fill="currentColor" opacity="0.65" stroke="none" /></>;
  if (type === "orthogonal") return <svg {...common}>{nodes}<path d="M7 16h9V5h40M7 16h49M7 16h9v11h40" /></svg>;
  if (type === "straight") return <svg {...common}>{nodes}<path d="M7 16L56 5M7 16h49M7 16l49 11" /></svg>;
  return <svg {...common}>{nodes}<path d="M7 16c10 0 10-11 20-11h29M7 16h49M7 16c10 0 10 11 20 11h29" /></svg>;
}

export function getLineDashIcon(dash: "solid" | "dashed" | "dotted", className = "w-8 h-1.5") {
  return <svg className={className} viewBox="0 0 32 6" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="2" y1="3" x2="30" y2="3" strokeDasharray={dash === "solid" ? undefined : dash === "dashed" ? "5 4" : "1 3.5"} strokeLinecap="round" /></svg>;
}

export function getArrowStyleIcon(style: "none" | "arrow" | "dot" | "slash", position: "start" | "end", className = "w-6 h-3") {
  const start = position === "start";
  const line = start ? <line x1="6" y1="6" x2="22" y2="6" strokeLinecap="round" /> : <line x1="2" y1="6" x2="18" y2="6" strokeLinecap="round" />;
  if (style === "none") return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="6" x2="22" y2="6" strokeLinecap="round" /></svg>;
  if (style === "dot") return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.5">{line}<circle cx={start ? "4" : "20"} cy="6" r="2.5" fill="currentColor" stroke="none" /></svg>;
  if (style === "slash") return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="6" x2="22" y2="6" strokeLinecap="round" /><line x1={start ? "4" : "16"} y1="2" x2={start ? "8" : "20"} y2="10" strokeLinecap="round" /></svg>;
  return <svg className={className} viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="6" x2="22" y2="6" strokeLinecap="round" /><path d={start ? "M7 3L2 6L7 9" : "M17 3L22 6L17 9"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
