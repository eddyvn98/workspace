import type { Prisma } from "@prisma/client";

export type WorkspaceCommentStore = Pick<Prisma.TransactionClient, "workspaceBoardComment">;
