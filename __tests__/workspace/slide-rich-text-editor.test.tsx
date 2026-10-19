// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlideSceneRichTextEditor } from "@/app/workspace/components/slides/SlideSceneRichTextEditor";
import type { SlideSceneObject } from "@/app/workspace/types/slideScene";
import { sceneRichTextPlainText, resolvedSceneTextStyle, sceneTextSignature } from "@/app/workspace/types/slideSceneText";
const object: SlideSceneObject = { id: "t", kind: "text", x: 20, y: 30, w: 600, h: 240, rotation: 0,
  text: "Hello world", fontSize: 40, color: "#112233", fontFamily: "Arial", fontWeight: "normal",
  richText: { version: 1, paragraphs: [{ runs: [{ text: "Hello " }, { text: "world", italic: true, color: "#CC3300" }] }] } };
afterEach(cleanup);
describe("Rich slide text editing", () => {
  it("renders an editable rich document and cancels without publishing", () => {
    const onApply = vi.fn(() => true), onCancel = vi.fn();
    render(<SlideSceneRichTextEditor object={object} onApply={onApply} onCancel={onCancel}/>);
    expect(screen.getByRole("textbox", { name: "Rich slide text" }).textContent).toBe("Hello world");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce(); expect(onApply).not.toHaveBeenCalled();
  });
  it("applies the structured draft without flattening existing run formatting", () => {
    const onApply = vi.fn(() => true);
    render(<SlideSceneRichTextEditor object={object} onApply={onApply} onCancel={() => {}}/>);
    fireEvent.click(screen.getByRole("button", { name: "Apply text formatting" }));
    expect(onApply).toHaveBeenCalledOnce();
    const rich = onApply.mock.calls[0][0] as unknown as NonNullable<SlideSceneObject["richText"]>;
    expect(sceneRichTextPlainText(rich)).toBe("Hello world");
    const last = rich.paragraphs[0].runs[rich.paragraphs[0].runs.length - 1];
    expect(resolvedSceneTextStyle(object, last)).toMatchObject({ italic: true, color: "#CC3300" });
  });
  it("keeps the editor open and explains a rejected stale draft", () => {
    render(<SlideSceneRichTextEditor object={object} onApply={() => false} onCancel={() => {}}/>);
    fireEvent.click(screen.getByRole("button", { name: "Apply text formatting" }));
    expect(screen.getByRole("alert").textContent).toContain("changed while this editor was open");
    expect(screen.getByRole("dialog", { name: "Format slide text" })).toBeTruthy();
  });
  it("detects formatting changes but permits unrelated geometry to be retained at commit", () => {
    expect(sceneTextSignature({ ...object, x: 400, rotation: 90 })).toBe(sceneTextSignature(object));
    expect(sceneTextSignature({ ...object, fontSize: 60 })).not.toBe(sceneTextSignature(object));
    expect(sceneTextSignature({ ...object, richText: { version: 1, paragraphs: [{ runs: [{ text: "Hello world", bold: true }] }] } })).not.toBe(sceneTextSignature(object));
  });
});
