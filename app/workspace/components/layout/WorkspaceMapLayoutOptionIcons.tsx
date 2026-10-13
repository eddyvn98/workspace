import type { WorkspaceMapLayoutDirection, WorkspaceMapLayoutFamily } from "@/app/workspace/utils/layout";

const NODE = "fill-white dark:fill-slate-900 stroke-current";
const ROOT_NODE = "fill-slate-800 dark:fill-slate-100 stroke-current";
const LINE = "fill-none stroke-current";

function HierarchyThumbnail({ direction }: { direction: WorkspaceMapLayoutDirection }) {
  if (direction === "right" || direction === "left") {
    const rootX = direction === "right" ? 5 : 47;
    const branchX = direction === "right" ? 28 : 24;
    const leafX = direction === "right" ? 51 : 1;
    const rootEdge = direction === "right" ? rootX + 12 : rootX;
    const branchEdge = direction === "right" ? branchX : branchX + 12;
    const branchOut = direction === "right" ? branchX + 12 : branchX;
    const leafEdge = direction === "right" ? leafX : leafX + 12;
    return <>
      <path d={`M ${rootEdge} 22 C ${(rootEdge + branchEdge) / 2} 22 ${(rootEdge + branchEdge) / 2} 22 ${branchEdge} 22 M ${branchOut} 22 C ${(branchOut + leafEdge) / 2} 22 ${(branchOut + leafEdge) / 2} 11 ${leafEdge} 11 M ${branchOut} 22 C ${(branchOut + leafEdge) / 2} 22 ${(branchOut + leafEdge) / 2} 33 ${leafEdge} 33`} className={LINE} strokeWidth="1.7" />
      <rect x={rootX} y="16" width="12" height="12" rx="2" className={ROOT_NODE} />
      <rect x={branchX} y="16" width="12" height="12" rx="2" className={NODE} />
      <rect x={leafX} y="6" width="12" height="10" rx="2" className={NODE} />
      <rect x={leafX} y="28" width="12" height="10" rx="2" className={NODE} />
    </>;
  }
  const rootY = direction === "down" ? 3 : 31;
  const branchY = direction === "down" ? 18 : 16;
  const leafY = direction === "down" ? 33 : 1;
  return <>
    <path d={`M 34 ${rootY + (direction === "down" ? 10 : 0)} V ${branchY + 5} M 34 ${branchY + 5} V ${leafY + (direction === "down" ? 0 : 9)} M 34 ${branchY + 5} H 15 V ${leafY + (direction === "down" ? 0 : 9)} M 34 ${branchY + 5} H 53 V ${leafY + (direction === "down" ? 0 : 9)}`} className={LINE} strokeWidth="1.7" />
    <rect x="27" y={rootY} width="14" height="10" rx="2" className={ROOT_NODE} />
    <rect x="27" y={branchY} width="14" height="10" rx="2" className={NODE} />
    <rect x="8" y={leafY} width="14" height="9" rx="2" className={NODE} />
    <rect x="46" y={leafY} width="14" height="9" rx="2" className={NODE} />
  </>;
}

function TimelineThumbnail({ direction }: { direction: WorkspaceMapLayoutDirection }) {
  const horizontal = direction === "right" || direction === "left";
  if (horizontal) {
    const rootX = direction === "right" ? 4 : 52;
    const nodeXs = direction === "right" ? [28, 52] : [28, 4];
    const rootEdge = direction === "right" ? rootX + 12 : rootX;
    const nodeEdge = direction === "right" ? nodeXs[0] : nodeXs[0] + 12;
    return <>
      <path d={`M ${rootEdge} 22 H ${nodeEdge} M ${direction === "right" ? nodeXs[0] + 12 : nodeXs[0]} 22 H ${direction === "right" ? nodeXs[1] : nodeXs[1] + 12}`} className={LINE} strokeWidth="1.7" />
      <rect x={rootX} y="16" width="12" height="12" rx="2" className={ROOT_NODE} />
      {nodeXs.map((x) => <rect key={x} x={x} y="17" width="12" height="10" rx="2" className={NODE} />)}
    </>;
  }
  const rootY = direction === "down" ? 2 : 30;
  const nodeYs = direction === "down" ? [17, 31] : [17, 3];
  return <>
    <path d={`M 34 ${direction === "down" ? rootY + 10 : rootY} V ${direction === "down" ? nodeYs[0] : nodeYs[0] + 10} M 34 ${direction === "down" ? nodeYs[0] + 10 : nodeYs[0]} V ${direction === "down" ? nodeYs[1] : nodeYs[1] + 10}`} className={LINE} strokeWidth="1.7" />
    <rect x="28" y={rootY} width="12" height="10" rx="2" className={ROOT_NODE} />
    {nodeYs.map((y) => <rect key={y} x="29" y={y} width="10" height="9" rx="2" className={NODE} />)}
  </>;
}

function TreeviewThumbnail({ direction }: { direction: WorkspaceMapLayoutDirection }) {
  const railLeft = direction === "right" || direction === "up";
  const growsUp = direction === "up" || direction === "down";
  const railX = railLeft ? 14 : 54;
  const cardX = railLeft ? 25 : 7;
  const cardEdge = railLeft ? cardX : cardX + 36;
  return <g transform={growsUp ? "scale(1,-1) translate(0,-44)" : undefined}>
    <path d={`M ${cardEdge} 9 H ${railX} V 37 M ${railX} 19 H ${cardEdge} M ${railX} 31 H ${cardEdge}`} className={LINE} strokeWidth="1.7" />
    <rect x={cardX} y="4" width="36" height="10" rx="2" className={ROOT_NODE} />
    <rect x={cardX} y="15" width="36" height="9" rx="2" className={NODE} />
    <rect x={cardX} y="27" width="36" height="9" rx="2" className={NODE} />
  </g>;
}

function TimelineBranchThumbnail({ mode }: { mode: "auto" | "one-side" | "one-side-reverse" | "alternate" }) {
  return <>
    <path d="M 8 22 H 60" className={LINE} strokeWidth="2" />
    {[16, 34, 52].map((x, index) => {
      const top = mode === "one-side-reverse" ? true : mode === "alternate" ? index % 2 === 1 : mode === "auto" && index === 2;
      const y = top ? 7 : 29;
      return <g key={x}><circle cx={x} cy="22" r="2.5" className={NODE} strokeWidth="1.5" /><path d={`M ${x} ${top ? 19.5 : 24.5} V ${top ? 15 : 29}`} className={LINE} /><rect x={x - 6} y={y} width="12" height="7" rx="1.5" className={NODE} /></g>;
    })}
    {mode === "auto" && <circle cx="60" cy="7" r="3" className="fill-current" />}
  </>;
}

export function WorkspaceMapLayoutDirectionThumbnail({ family, direction, growthMode }: { family: WorkspaceMapLayoutFamily; direction: WorkspaceMapLayoutDirection; growthMode?: "one-side" | "both-side" }) {
  return <svg viewBox="0 0 68 44" className="h-11 w-[68px]" aria-hidden="true">
    {family === "timeline" ? <TimelineThumbnail direction={direction} /> : family === "treeview" ? <TreeviewThumbnail direction={direction} /> : <HierarchyThumbnail direction={growthMode === "both-side" ? (direction === "down" || direction === "up" ? "down" : "right") : direction} />}
  </svg>;
}

export function WorkspaceMapLayoutLineStyleThumbnail({ style }: { style: "curved" | "orthogonal" | "straight" }) {
  return <svg viewBox="0 0 68 32" className="h-8 w-[68px]" aria-hidden="true">
    <rect x="4" y="13" width="7" height="7" rx="1.5" className={ROOT_NODE} />
    {style === "curved" && <path d="M 11 16.5 C 25 16.5 24 6 38 6 H 59 M 11 16.5 H 59 M 11 16.5 C 25 16.5 24 27 38 27 H 59" className={LINE} strokeWidth="1.8" strokeLinecap="round" />}
    {style === "orthogonal" && <path d="M 11 16.5 H 22 V 6 H 59 M 11 16.5 H 59 M 11 16.5 H 22 V 27 H 59" className={LINE} strokeWidth="1.8" strokeLinecap="round" />}
    {style === "straight" && <path d="M 11 16.5 L 59 6 M 11 16.5 H 59 M 11 16.5 L 59 27" className={LINE} strokeWidth="1.8" strokeLinecap="round" />}
    <rect x="57" y="3" width="7" height="7" rx="1.5" className={NODE} /><rect x="57" y="13" width="7" height="7" rx="1.5" className={NODE} /><rect x="57" y="24" width="7" height="7" rx="1.5" className={NODE} />
  </svg>;
}

export function WorkspaceMapLayoutTimelineThumbnail({ mode }: { mode: "auto" | "one-side" | "one-side-reverse" | "alternate" }) {
  return <svg viewBox="0 0 68 44" className="h-8 w-full" aria-hidden="true"><TimelineBranchThumbnail mode={mode} /></svg>;
}

export function WorkspaceMapLayoutStructureIcon({ family, compact = false }: { family: WorkspaceMapLayoutFamily; compact?: boolean }) {
  const className = compact ? "h-4 w-5" : "h-5 w-8";
  return <svg viewBox="0 0 44 28" fill="none" className={className} aria-hidden="true">
    {family === "hierarchy" && <>
      <rect x="1" y="10" width="9" height="8" rx="1.5" fill="currentColor" opacity="0.9" />
      <path d="M10 14 h4 V6 h9 M10 14 h13 M10 14 h4 V22 h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <rect x="23" y="3" width="10" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="23" y="11" width="10" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="23" y="19" width="10" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <path d="M33 6 h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
      <rect x="37" y="3.5" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
    </>}
    {family === "treeview" && <>
      <rect x="2" y="1" width="40" height="7" rx="1.5" fill="currentColor" opacity="0.85" />
      <rect x="8" y="11" width="34" height="5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="8" y="18" width="34" height="5" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="8" y="24" width="22" height="3" rx="1" fill="currentColor" opacity="0.3" />
      <line x1="5" y1="8" x2="5" y2="26" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="5" y1="13.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="5" y1="20.5" x2="8" y2="20.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="5" y1="25.5" x2="8" y2="25.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </>}
    {family === "timeline" && <>
      <line x1="3" y1="14" x2="41" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <circle cx="10" cy="14" r="2.5" fill="currentColor" opacity="0.9" />
      <circle cx="22" cy="14" r="2.5" fill="currentColor" opacity="0.9" />
      <circle cx="34" cy="14" r="2.5" fill="currentColor" opacity="0.9" />
      <rect x="4" y="4" width="12" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
      <line x1="10" y1="11" x2="10" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <rect x="16" y="18" width="12" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
      <line x1="22" y1="16.5" x2="22" y2="18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <rect x="28" y="4" width="12" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
      <line x1="34" y1="11" x2="34" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </>}
    {family === "flowchart" && <>
      <rect x="15" y="1" width="14" height="6" rx="3" fill="currentColor" opacity="0.85" />
      <path d="M22 7 V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <polygon points="22,10 28,14 22,18 16,14" fill="currentColor" opacity="0.7" />
      <path d="M16 14 H8 V22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M28 14 H36 V22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <rect x="2" y="22" width="12" height="5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="30" y="22" width="12" height="5" rx="1" fill="currentColor" opacity="0.55" />
    </>}
    {family === "swimlane" && <>
      <rect x="1" y="3" width="42" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" fill="none" />
      <rect x="1" y="15" width="42" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" fill="none" />
      <rect x="1" y="3" width="11" height="10" rx="1.5" fill="currentColor" opacity="0.3" />
      <rect x="1" y="15" width="11" height="10" rx="1.5" fill="currentColor" opacity="0.3" />
      <rect x="16" y="5.5" width="10" height="5" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="31" y="5.5" width="9" height="5" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="16" y="17.5" width="10" height="5" rx="1" fill="currentColor" opacity="0.6" />
      <path d="M26 8 H31" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M21 10.5 V17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </>}
    {family === "fishbone" && <>
      <line x1="6" y1="14" x2="40" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <path d="M37 11 L41 14 L37 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85" />
      <line x1="16" y1="14" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <line x1="27" y1="14" x2="23" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <line x1="16" y1="14" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <line x1="27" y1="14" x2="23" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <line x1="14" y1="10" x2="11" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      <line x1="25" y1="10" x2="22" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      <line x1="14" y1="18" x2="11" y2="21" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      <line x1="25" y1="18" x2="22" y2="21" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      <rect x="1" y="11" width="8" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
    </>}
  </svg>;
}
