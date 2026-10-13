import { describe, expect, it } from "vitest";
import { scalePathPoints } from "../../app/workspace/utils/pathCad";

describe("scalePathPoints", () => {
  it("scales local path coordinates by the frame size ratio without mutating input", () => {
    const points = [{ x: 10, y: 5 }, { x: 40, y: 20 }];

    const scaled = scalePathPoints(
      points,
      { x: 0, y: 0, w: 100, h: 50, rotation: 0, zIndex: 0 },
      { x: 10, y: 20, w: 200, h: 25, rotation: 0, zIndex: 0 },
    );

    expect(scaled).toEqual([{ x: 20, y: 2.5 }, { x: 80, y: 10 }]);
    expect(points).toEqual([{ x: 10, y: 5 }, { x: 40, y: 20 }]);
  });
});
