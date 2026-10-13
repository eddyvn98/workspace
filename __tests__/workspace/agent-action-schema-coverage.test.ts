import { describe, expect, it } from "vitest";
import { WORKSPACE_COMMAND_NAMES } from "@/lib/workspace-command-registry";
import { WORKSPACE_RUNTIME_ACTION_SCHEMAS } from "@/lib/workspace-agent/actionSchema";
import { selectWorkspaceCapabilities } from "@/lib/workspace-agent/capabilitySelection";

describe("Workspace runtime action schema coverage", () => {
  it("has one closed top-level parameter contract for every registered command", () => {
    expect(Object.keys(WORKSPACE_RUNTIME_ACTION_SCHEMAS).sort()).toEqual([...WORKSPACE_COMMAND_NAMES].sort());
    const incomplete = Object.entries(WORKSPACE_RUNTIME_ACTION_SCHEMAS).filter(([, schema]) => schema.additionalProperties !== false);
    expect(incomplete.map(([name]) => name)).toEqual([]);
  });

  it("exposes catalog column count to arrange_selection requests", () => {
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.arrange_selection.properties.columns).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 500,
    });
  });

  it("selects the layout capability for z-order requests", () => {
    const capabilities = selectWorkspaceCapabilities(
      'Only run update_z_order with blockId="shape-1" and zOrder="front".',
    );

    expect(capabilities.find((item) => item.category === "layout")?.commands).toContain("update_z_order");
  });
});
