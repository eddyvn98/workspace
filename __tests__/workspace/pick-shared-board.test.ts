import { describe, expect, it } from "vitest";
import { pickSharedBoardToOpen } from "@/app/workspace/utils/pickSharedBoardToOpen";

const board = (id: string, updatedAt: string) => ({
  id, title: id, updatedAt, ownerEmail: "o@example.test", role: "EDITOR" as const,
});

describe("pickSharedBoardToOpen", () => {
  it("returns null when nothing is shared", () => {
    expect(pickSharedBoardToOpen([], [])).toBeNull();
  });

  it("picks the most recently updated shared board", () => {
    const picked = pickSharedBoardToOpen(
      [board("old", "2026-09-01T00:00:00Z"), board("new", "2026-10-01T00:00:00Z")],
      [],
    );
    expect(picked?.id).toBe("new");
  });

  it("skips boards the user hid, and returns null if all are hidden", () => {
    const shared = [board("a", "2026-10-02T00:00:00Z"), board("b", "2026-10-01T00:00:00Z")];
    expect(pickSharedBoardToOpen(shared, ["a"])?.id).toBe("b");
    expect(pickSharedBoardToOpen(shared, ["a", "b"])).toBeNull();
  });
});
