// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WorkspaceArrangeMenu } from "@/app/workspace/components/WorkspaceArrangeMenu";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { resolveTransform } from "@/app/workspace/types/block";

afterEach(cleanup);

it("Grid writes selected layout into the effective transform override", async () => {
  const transform = (x: number, y: number) => ({ computed: null, override: { x, y, w: 100, h: 60, rotation: 0, zIndex: 0 } });
  useWorkspaceStore.setState({
    isReadOnly: false,
    selectedBlockIds: ["first", "second"],
    blocks: {
      first: { id: "first", type: "shape", data: { label: "First" }, transform: transform(0, 0) },
      second: { id: "second", type: "shape", data: { label: "Second" }, transform: transform(400, 400) },
    } as never,
  });

  render(<WorkspaceArrangeMenu />);
  // Radix DropdownMenu opens on pointer down rather than a synthetic click.
  fireEvent.pointerDown(screen.getByRole("button", { name: "Arrange selection" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("button", { name: /^Grid/ }));

  const second = useWorkspaceStore.getState().blocks.second;
  expect(resolveTransform(second.transform, { x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0 })).toMatchObject({ x: 165, y: 0 });
});
