import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ board: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: mocks.board } } }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.role }));
import { requireBoardWrite, WorkspaceAccessError, chunkText } from "@/lib/workspace/knowledge-repository";

/** The old /api/chat/files proxy is no longer present. Exercise the active
 * per-board knowledge upload boundary instead of importing a deleted route. */
describe("Workspace document upload authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.board.mockResolvedValue({ id: "board-123", ownerEmail: "user@example.com" });
    mocks.role.mockResolvedValue("EDITOR");
  });
  it("allows an editor to add knowledge to their own board", async () => {
    await expect(requireBoardWrite("board-123", "user@example.com")).resolves.toBeUndefined();
    expect(mocks.board).toHaveBeenCalledWith({
      where: { id: "board-123" }, select: { id: true, ownerEmail: true },
    });
    expect(mocks.role).toHaveBeenCalledWith({ id: "board-123", ownerEmail: "user@example.com" }, "user@example.com");
  });
  it("denies VIEWER writes and hidden boards", async () => {
    mocks.role.mockResolvedValueOnce("VIEWER");
    await expect(requireBoardWrite("board-123", "viewer@example.com"))
      .rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<WorkspaceAccessError>);
    mocks.board.mockResolvedValueOnce(null);
    await expect(requireBoardWrite("missing", "user@example.com"))
      .rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<WorkspaceAccessError>);
  });
  it("bounds extracted document paragraphs before indexing", () => {
    const result = chunkText("A".repeat(2050) + "\n\n" + "B".repeat(25), 2000);
    expect(result.every(part => part.length <= 2000)).toBe(true);
    expect(result.join("")).toBe("A".repeat(2050) + "B".repeat(25));
  });
});
