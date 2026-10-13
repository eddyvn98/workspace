import { prisma } from "@/lib/prisma";
import { deleteResourceObject } from "./resource-storage";
import { requireBoardWrite, WorkspaceAccessError } from "./knowledge-repository";

export class WorkspaceResourceInUseError extends Error {
	constructor() {
		super("Remove this asset from the canvas before deleting it.");
		this.name = "WorkspaceResourceInUseError";
	}
}

export async function deleteResource(boardId: string, callerEmail: string, resourceId: string): Promise<void> {
	await requireBoardWrite(boardId, callerEmail);
	const objectKeys = await prisma.$transaction(async (tx) => {
		// Serialize against board saves and invalidate stale tabs that still
		// hold this resource id after deletion.
		await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM workspace_boards WHERE id = ${boardId} FOR UPDATE`;
		const [resource, board] = await Promise.all([
			tx.workspaceResource.findFirst({
				where: { id: resourceId, boardId },
				select: { sourceDocumentId: true, versions: { select: { storageKey: true, artifacts: { select: { storageKey: true } } } } },
			}),
			tx.workspaceBoard.findUnique({ where: { id: boardId }, select: { blocks: true } }),
		]);
		if (!resource || !board) throw new WorkspaceAccessError("NOT_FOUND", "Resource not found");

		const blocks = board.blocks && typeof board.blocks === "object" && !Array.isArray(board.blocks)
			? Object.values(board.blocks as Record<string, unknown>)
			: Array.isArray(board.blocks) ? board.blocks : [];
		const usedOnCanvas = blocks.some((value) => {
			if (!value || typeof value !== "object") return false;
			const data = (value as { data?: unknown }).data;
			return !!data && typeof data === "object" && (data as { resourceId?: unknown }).resourceId === resourceId;
		});
		const referenceCount = await tx.workspaceResourceReference.count({ where: { boardId, resourceId } });
		if (usedOnCanvas || referenceCount > 0) throw new WorkspaceResourceInUseError();

		if (resource.sourceDocumentId) {
			await tx.workspaceSourceDocument.deleteMany({ where: { id: resource.sourceDocumentId, boardId } });
		}
		await tx.workspaceResource.delete({ where: { id: resourceId } });
		await tx.workspaceBoard.update({ where: { id: boardId }, data: { revision: { increment: 1 } } });
		return resource.versions.flatMap((version) => [
			version.storageKey,
			...version.artifacts.map((artifact) => artifact.storageKey).filter((key): key is string => Boolean(key)),
		]);
	});
	await Promise.all(objectKeys.map((key) => deleteResourceObject(key)));
}
