"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  addBoardShare,
  fetchBoardShares,
  removeBoardShare,
  updateBoardShareRole,
  type WorkspaceShare,
  type WorkspaceShareRole,
} from "../hooks/workspaceShareApi";
import { useIsBoardOwner } from "../hooks/useIsBoardOwner";
import { useWorkspaceRemoteBoardId } from "../hooks/useWorkspaceRemoteBoardId";
import { WorkspacePublicLinkSection } from "./WorkspacePublicLinkSection";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/** Owner-only board-collaborator manager — a scaled-down, single-board
 *  equivalent of the old app's PageShareDialog (inventory §10): invite by
 *  email with a VIEWER/EDITOR role, list current collaborators, revoke.
 *  Non-owner collaborators can open the dialog and receive the same owner-only
 *  feedback as the old Mindmap share dialog; the API remains the authority
 *  for the roster and mutation permissions. */
export function WorkspaceShareDialog({
  boardId,
  open,
  onOpenChange,
  showTrigger = true,
}: {
  boardId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const isOwner = useIsBoardOwner(boardId);
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const currentUserEmail = useWorkspaceStore((state) => state.currentUserEmail);
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const [shares, setShares] = useState<WorkspaceShare[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceShareRole>("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const setOpen = useCallback((nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen || isOwner !== true || !remoteBoardId) return;
    let cancelled = false;
    setIsLoadingShares(true);
    fetchBoardShares(remoteBoardId).then((nextShares) => {
      if (!cancelled) setShares(nextShares);
    }).finally(() => {
      if (!cancelled) setIsLoadingShares(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, remoteBoardId, isOwner]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, setOpen]);

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    setError(null);
    const result = await addBoardShare(boardId, trimmed, role);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    setShares(await fetchBoardShares(boardId));
    toast.success(`Invited ${trimmed} as ${role.toLowerCase()}`);
  };

  const handleRoleChange = async (invitedEmail: string, nextRole: WorkspaceShareRole) => {
    setError(null);
    const previousShares = shares;
    // Optimistic update
    setShares((current) =>
      current.map((s) => (s.invitedEmail === invitedEmail ? { ...s, role: nextRole } : s))
    );
    const result = await updateBoardShareRole(boardId, invitedEmail, nextRole);
    if (!result.ok) {
      setError(result.error);
      setShares(previousShares);
    }
  };

  const handleRemove = async (invitedEmail: string) => {
    setError(null);
    const previousShares = shares;
    setShares((current) => current.filter((s) => s.invitedEmail !== invitedEmail));
    const result = await removeBoardShare(boardId, invitedEmail);
    if (!result.ok) {
      setError(result.error);
      setShares(previousShares);
      return;
    }
    toast.success(`Removed ${invitedEmail}`);
  };

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Share this mindmap"
          aria-label="Share"
        >
          <Users className="h-4 w-4" />
        </button>
      )}

      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="workspace-share-title" className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2"><Users className="h-5 w-5 text-orange-500" /><span id="workspace-share-title" className="text-sm font-bold">Share mindmap</span></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close share dialog" className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
              {isOwner === false ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Only the owner of this mindmap can manage sharing.
                </div>
              ) : isOwner === null ? (
                <div className="flex items-center justify-center py-10 text-slate-400" aria-label="Loading sharing permissions">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : <>
              <div className="space-y-2">
                <label htmlFor="workspace-share-email" className="block text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Invite by email</label>
                <div className="flex gap-2">
                  <input id="workspace-share-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleInvite()} placeholder="colleague@example.com" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800" />
                  <select id="workspace-share-role" name="role" value={role} onChange={(e) => setRole(e.target.value as WorkspaceShareRole)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800">
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                  <button type="button" onClick={handleInvite} disabled={isSubmitting || !email.trim()} aria-label="Invite" title="Invite" className="flex shrink-0 items-center justify-center rounded-xl bg-orange-500 p-2 text-white transition-colors hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-orange-500">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}</button>
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="space-y-2">
                <div className="block text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Collaborators</div>
                <div className="max-h-64 space-y-1 overflow-y-auto" aria-label="Collaborators">
                  {isLoadingShares && shares.length === 0 ? <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : shares.length === 0 && <div className="py-3 text-center text-xs text-slate-400">Not shared with anyone yet.</div>}
                  {shares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold">{share.invitedEmail}</span>
                        {currentUserEmail?.toLowerCase() === share.invitedEmail.toLowerCase() && <span className="block text-[10px] text-slate-400">You</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <select
                          value={share.role}
                          onChange={(e) => handleRoleChange(share.invitedEmail, e.target.value as WorkspaceShareRole)}
                          className="px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                          aria-label={`Role for ${share.invitedEmail}`}
                        >
                          <option value="VIEWER">Viewer</option>
                          <option value="EDITOR">Editor</option>
                        </select>
                        <button type="button" onClick={() => handleRemove(share.invitedEmail)} aria-label={`Remove ${share.invitedEmail}`} title={`Remove ${share.invitedEmail}`} className="p-1 text-slate-400 hover:text-red-500 dark:text-slate-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <WorkspacePublicLinkSection boardId={boardId} />
              </>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default WorkspaceShareDialog;
