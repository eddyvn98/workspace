import { describe, expect, it } from "vitest";
import { routePositionedSemanticEdges } from "@/app/workspace/layout/semanticDiagramLayout";

describe("positioned semantic edge routing", () => {
  it("prefers a short clear-of-blocks route over an outer-map detour", () => {
    const positions = new Map([
      ["source", { x: 0, y: 100, w: 100, h: 60 }],
      ["target", { x: 400, y: 100, w: 100, h: 60 }],
      ["upper", { x: 200, y: 0, w: 100, h: 60 }],
      ["lower", { x: 200, y: 250, w: 100, h: 60 }],
    ]);
    const edges = [
      { from: "upper", to: "lower" },
      { from: "source", to: "target" },
    ];

    const route = routePositionedSemanticEdges(edges, positions, "right").get(1);

    expect(route).toBeDefined();
    expect(route?.waypoints).toEqual([]);
    expect(route?.fromSide).toBe("right");
    expect(route?.toSide).toBe("left");
  });

  it("routes around an intermediate block using a nearby channel", () => {
    const positions = new Map([
      ["speaker-confirmed", { x: 0, y: 100, w: 100, h: 60 }],
      ["agenda-reviewed", { x: 200, y: 100, w: 100, h: 60 }],
      ["agenda-published", { x: 400, y: 100, w: 100, h: 60 }],
    ]);
    const edges = [
      { from: "speaker-confirmed", to: "agenda-reviewed" },
      { from: "agenda-reviewed", to: "agenda-published" },
      { from: "speaker-confirmed", to: "agenda-published" },
    ];

    const route = routePositionedSemanticEdges(edges, positions, "right").get(2);

    expect(route).toBeDefined();
    expect(route?.waypoints.length).toBeGreaterThan(0);
    expect(route?.waypoints.every((point) => point.y >= 76 && point.y <= 184)).toBe(true);
  });
});
