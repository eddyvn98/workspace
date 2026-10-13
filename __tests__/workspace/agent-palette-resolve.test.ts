import { describe, expect, it } from "vitest";
import { resolveMapPaletteId } from "@/app/api/workspaces/[id]/agent/mapStyleParity";

describe("resolveMapPaletteId", () => {
  it("keeps exact ids and names", () => {
    expect(resolveMapPaletteId("pastel")).toBe("pastel");
    expect(resolveMapPaletteId("Soft Pastel")).toBe("pastel");
  });
  it("maps a color word to a palette", () => {
    expect(resolveMapPaletteId("blue")).toBe("monochrome");
    expect(resolveMapPaletteId("a blue palette")).toBe("monochrome");
  });
  it("rejects nonsense", () => {
    expect(resolveMapPaletteId("zzzz")).toBeUndefined();
    expect(resolveMapPaletteId("")).toBeUndefined();
  });
});
