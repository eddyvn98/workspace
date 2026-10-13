"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { colorForEmail, initialsForEmail } from "../utils/presenceColor";

/** Colored ring + tiny avatar chip on a block another collaborator currently
 *  has selected — a simplified port of the old app's presence focus ring
 *  (CONTRACTS.md parity-gap-audit §3, Tier 3 item 12). Polling-based (same
 *  8s heartbeat as the rest of presence, see useWorkspacePresence.ts), so
 *  this lags real cursor movement by design — no live "X is editing…" toast,
 *  just the ring itself (a disclosed v1 cut, not an oversight). */
export function BlockPresenceRing({ blockId }: { blockId: string }) {
  const remoteViewers = useWorkspaceStore((state) => state.remoteViewers);
  const viewer = remoteViewers.find((v) => v.selectedBlockId === blockId);

  if (!viewer) return null;

  const color = colorForEmail(viewer.email);

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{ boxShadow: `0 0 0 2px ${color}`, zIndex: 21 }}
    >
      <span
        title={viewer.email}
        className="absolute -top-2.5 -left-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white shadow"
        style={{ backgroundColor: color }}
      >
        {initialsForEmail(viewer.email)}
      </span>
      <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: color }}>
        {viewer.email}
      </span>
    </div>
  );
}

export default BlockPresenceRing;
