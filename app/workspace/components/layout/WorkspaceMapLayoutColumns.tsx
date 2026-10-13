"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const STRUCTURE_WIDTH = 190;
export const FLYOUT_GAP = 4;
export const DIRECTION_WIDTH = 158;
export const LINE_WIDTH = 158;
export const PALETTE_WIDTH = 176;

export function WorkspaceMapLayoutColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="h-fit w-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</div>
      {children}
    </section>
  );
}
export function WorkspaceMapLayoutFlyoutColumn({
  side,
  offset,
  width,
  title,
  children,
}: {
  side: "left" | "right";
  offset: number;
  width: number;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [horizontalShift, setHorizontalShift] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    const root = element?.offsetParent?.getBoundingClientRect();
    if (!element || !root) return;
    const rect = element.getBoundingClientRect();
    const minTop = 8 - root.top;
    const maxTop = window.innerHeight - 8 - rect.height - root.top;
    setTop(Math.max(minTop, Math.min(0, maxTop)));
    const desiredLeft = side === "right"
      ? root.left + offset + FLYOUT_GAP
      : root.right - offset - FLYOUT_GAP - width;
    const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - width - 8));
    setHorizontalShift(clampedLeft - desiredLeft);
  }, [children, offset, side, width]);

  const style: CSSProperties = side === "right"
    ? { left: offset + horizontalShift, top, width: width + FLYOUT_GAP, paddingLeft: FLYOUT_GAP }
    : { right: offset - horizontalShift, top, width: width + FLYOUT_GAP, paddingRight: FLYOUT_GAP };

  return <div ref={ref} className="absolute z-10" style={style}><WorkspaceMapLayoutColumn title={title}>{children}</WorkspaceMapLayoutColumn></div>;
}

export type WorkspaceMapLayoutStage = "structure" | "direction" | "line" | "palette";

const STAGE_LABELS: Record<WorkspaceMapLayoutStage, string> = {
  structure: "Structure",
  direction: "Direction",
  line: "Line",
  palette: "Color",
};

export function WorkspaceMapLayoutCompact({
  stage,
  path,
  children,
  onBack,
  onNavigate,
}: {
  stage: WorkspaceMapLayoutStage;
  path: readonly WorkspaceMapLayoutStage[];
  children: ReactNode;
  onBack: () => void;
  onNavigate: (stage: WorkspaceMapLayoutStage) => void;
}) {
  return (
    <section className="max-h-[310px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex h-6 items-center gap-1">
        {stage !== "structure" && <button type="button" onClick={onBack} aria-label="Back" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">←</button>}
        <nav aria-label="Map layout steps" className="flex min-w-0 items-center gap-1 text-[9px] font-semibold text-slate-400">
          {path.map((item, index) => <span key={item} className="flex min-w-0 items-center gap-1">
            {index > 0 && <span>/</span>}
            <button type="button" onClick={() => onNavigate(item)} aria-current={item === stage ? "step" : undefined} className={item === stage ? "truncate text-orange-600" : "truncate hover:text-slate-700 dark:hover:text-slate-200"}>{STAGE_LABELS[item]}</button>
          </span>)}
        </nav>
      </div>
      <div className="max-h-[262px] overflow-y-auto">{children}</div>
    </section>
  );
}
