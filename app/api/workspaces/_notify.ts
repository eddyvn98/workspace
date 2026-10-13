import { prisma } from "@/lib/prisma";
import type { WorkspaceNotificationType } from "@prisma/client";

/** Where a notification points, so the bell can focus the exact block and
 *  open the exact thread instead of merely opening the board (legacy does
 *  this via MindmapNotification.nodeId/commentId). Also carries the actor as
 *  a field, so the row can render who did it without parsing `body`. */
export interface NotificationAnchor {
  blockId?: string | null;
  commentId?: string | null;
  actorEmail?: string | null;
}

/** Fans a notification out to a board's owner + every share, minus
 *  `exclude` — the actor who caused it (a comment's own author never gets
 *  notified about their own comment), and anyone already receiving a
 *  higher-signal notification for the same event, which is why this takes a
 *  list and not one address. Best-effort: a failure here must never fail the
 *  request that triggered it (matches the fail-soft convention used
 *  everywhere else in this API family).
 *
 *  `only` narrows the fan-out to specific recipients — used for a REPLY (just
 *  the parent comment's author), so it lands as its own, higher-signal
 *  notification instead of the generic board-wide NEW_COMMENT. Narrowing
 *  still respects access: a name that is not a collaborator is dropped
 *  rather than notified about a board it cannot open. */
export async function notifyBoardCollaborators(
  boardId: string,
  exclude: string | string[],
  type: WorkspaceNotificationType,
  body: string,
  anchor: NotificationAnchor = {},
  only?: string[],
): Promise<void> {
  try {
    const [board, shares] = await Promise.all([
      prisma.workspaceBoard.findUnique({ where: { id: boardId }, select: { ownerEmail: true } }),
      prisma.workspaceBoardShare.findMany({ where: { boardId }, select: { invitedEmail: true } }),
    ]);
    if (!board) return;

    const everyone = new Set([board.ownerEmail, ...shares.map((s) => s.invitedEmail)]);
    // A narrowed fan-out still has to respect access: someone mentioned who
    // is not a collaborator must not receive a notification for a board they
    // cannot open.
    const lowered = new Map([...everyone].map((mail) => [mail.toLowerCase(), mail]));
    const recipients = only
      ? new Set(only.map((mail) => lowered.get(mail.toLowerCase())).filter((mail): mail is string => Boolean(mail)))
      : everyone;
    // Case-insensitively, because a stored row can spell the same person
    // differently than the caller does; a byte-exact removal would notify the
    // actor about their own action.
    const excluded = new Set(
      (Array.isArray(exclude) ? exclude : [exclude]).map((mail) => mail.toLowerCase()),
    );
    for (const mail of [...recipients]) {
      if (excluded.has(mail.toLowerCase())) recipients.delete(mail);
    }
    if (recipients.size === 0) return;

    await prisma.workspaceNotification.createMany({
      data: [...recipients].map((recipientEmail) => ({
        recipientEmail,
        boardId,
        type,
        body,
        blockId: anchor.blockId ?? null,
        commentId: anchor.commentId ?? null,
        actorEmail: anchor.actorEmail ?? null,
      })),
    });
  } catch {
    // Best-effort — never block the request that triggered this.
  }
}

/** Notifies a single recipient (e.g. a newly-invited collaborator). */
export async function notifyUser(
  recipientEmail: string,
  boardId: string,
  type: WorkspaceNotificationType,
  body: string,
  anchor: NotificationAnchor = {},
): Promise<void> {
  try {
    await prisma.workspaceNotification.create({
      data: {
        recipientEmail,
        boardId,
        type,
        body,
        blockId: anchor.blockId ?? null,
        commentId: anchor.commentId ?? null,
        actorEmail: anchor.actorEmail ?? null,
      },
    });
  } catch {
    // Best-effort
  }
}
