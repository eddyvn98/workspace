"use client";

import React from "react";

const itemClass =
  "w-full px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800";
const dangerItemClass =
  "w-full px-3 py-1.5 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30";

/** One row in BlockContextMenu.tsx — extracted to cut the repetition of a
 *  dozen near-identical <button role="menuitem"> blocks, freeing headroom
 *  under the 300-line cap for new items (e.g. §60's Flip actions). */
export function BlockContextMenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={danger ? dangerItemClass : itemClass}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default BlockContextMenuItem;
