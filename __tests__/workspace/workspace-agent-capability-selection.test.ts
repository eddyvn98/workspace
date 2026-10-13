import { describe, expect, it } from "vitest";
import { selectWorkspaceCapabilities } from "@/lib/workspace-agent/capabilitySelection";
import { buildModelStepQuery } from "@/lib/workspace-agent/modelStepContext";

function commandsFor(query: string) {
  const capabilities = selectWorkspaceCapabilities(query);
  const modelPayload = JSON.parse(buildModelStepQuery(
    { query, canMutate: true },
    { revision: 1, title: "Test", blocks: {}, blockOrder: [], connectors: {} },
    [],
    [],
  )) as { actionSchemas: Record<string, unknown> };
  return {
    categories: capabilities.map(({ category }) => category),
    commands: capabilities.flatMap(({ commands }) => commands),
    schemas: Object.keys(modelPayload.actionSchemas),
  };
}

describe("Workspace content capability selection", () => {
  it.each([
    "Mở lại thread P0 lifecycle parent 2026-10-07 trên Runtime batch evidence.",
    "Reopen the resolved thread P0 lifecycle parent on Runtime batch evidence.",
  ])("includes comment lifecycle commands and schemas for %s", (query) => {
    const selected = commandsFor(query);
    expect(selected.categories).toContain("collaboration");
    expect(selected.commands).toContain("list_comments");
    expect(selected.commands).toContain("reopen_comment");
    expect(selected.schemas).toContain("list_comments");
    expect(selected.schemas).toContain("reopen_comment");
  });

  it("includes content commands for fresh node rename requests", () => {
    const selected = commandsFor('Rename node "Milestone" to "Launch"');
    expect(selected.categories).toContain("content");
    expect(selected.commands).toContain("rename_topic");
    expect(selected.schemas).toContain("rename_topic");
  });

  it.each([
    "Set the node background to blue",
    "Change the Slides node style to #e6f4ea",
    "Đổi màu nền nút Slides thành xanh",
  ])("includes style commands for %s", (query) => {
    const selected = commandsFor(query);
    expect(selected.categories).toContain("content");
    expect(selected.commands).toContain("update_style");
    expect(selected.schemas).toContain("update_style");
  });

  it.each([
    "Move shape Probe to a new position",
    "Di chuyển shape Probe tới vị trí mới",
  ])("includes transform commands and schema for %s", (query) => {
    const selected = commandsFor(query);
    expect(selected.categories).toContain("layout");
    expect(selected.commands).toContain("update_transform");
    expect(selected.schemas).toContain("update_transform");
  });

  it("includes map-style commands for explicit hierarchy direction changes", () => {
    const selected = commandsFor("Dùng đúng command update_map_style cho map root ‘Runtime Map acceptance 2026-10-06’: đặt mapLayout.family=hierarchy và direction=left.");
    expect(selected.categories).toContain("map");
    expect(selected.commands).toContain("update_map_style");
    expect(selected.schemas).toContain("update_map_style");
  });

  it.each([
    "Bắt đầu trình chiếu frame Frame replay verification 2026-10-06",
    "Bắt đầu trình chiếu frame “Frame replay verification 2026-10-06”. Không tạo frame mới và không sửa nội dung.",
  ])("exposes frame playback commands, schema and guidance for %s", (query) => {
    const frameName = "Frame replay verification 2026-10-06";
    const capabilities = selectWorkspaceCapabilities(query);
    const payload = JSON.parse(buildModelStepQuery(
      { query, canMutate: true },
      {
        revision: 1, title: "Test", blocks: {}, blockOrder: [], connectors: {},
        frames: [{ id: "frame-1", name: frameName, order: 0, camera: { x: 0, y: 0, zoom: 1 } }],
      },
      [],
      [],
    ));

    expect(capabilities.flatMap(({ commands }) => commands)).toContain("focus_view");
    expect(payload.actionSchemas.focus_view.properties.mode.enum).toContain("present");
    expect(payload.actionSchemas.focus_view.properties.frameName).toMatchObject({ type: "string", minLength: 1 });
    expect(payload.actionSchemas.focus_view.properties.frameId).toMatchObject({ type: "string", minLength: 1 });
    expect(payload.board.frames).toContainEqual(expect.objectContaining({ id: "frame-1", name: frameName }));
    const guidance = payload.workspaceCapabilities.find((entry: { category: string }) => entry.category === "presentation").guidance;
    expect(guidance).toContain("focus_view {mode:present");
    expect(guidance).toContain("frameId/frameName");
  });
});
