// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { WorkspaceBlockAiPanel } from "@/app/workspace/components/WorkspaceBlockAiPanel";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(), sendMessageNow: vi.fn(), cancelCurrentRequest: vi.fn(),
  clearFiles: vi.fn(), activeRequest: null as unknown,
}));
vi.mock("@/app/workspace/hooks/useWorkspaceChat", () => ({
  useWorkspaceChat: () => ({ ...mocks, messages: [], queue: [], isSending: Boolean(mocks.activeRequest) }),
}));
vi.mock("@/app/workspace/hooks/useWorkspaceChatFileUpload", () => ({
  useWorkspaceChatFileUpload: () => ({ attachedFiles: [], clearFiles: mocks.clearFiles }),
}));
vi.mock("@/components/child-components/ai-select-models", () => ({ AIActionLauncher: () => null }));
vi.mock("@/stores/useMessageStore", () => ({
  useMessageStore: { getState: () => ({ selectedModel: { id: "deepseek/flash" }, setSelectedModel: vi.fn() }) },
}));
vi.mock("@/app/workspace/components/WorkspaceChatMessageList", () => ({ WorkspaceChatMessageList: () => <div>Messages</div> }));

describe("document full view AI composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeRequest = null;
    useWorkspaceStore.setState({
      boardId: "board", isReadOnly: false, selectedBlockIds: ["other"],
      blocks: {
        doc: { id: "doc", type: "doc", data: { html: "<p>Current document</p>" }, transform: { computed: null, override: {} }, createdAt: 1, updatedAt: 1 },
        other: { id: "other", type: "text", data: { markdown: "Other selection" }, transform: { computed: null, override: {} }, createdAt: 1, updatedAt: 1 },
      },
    });
  });
  afterEach(cleanup);

  it("disables empty input and sends the current document, independent of canvas selection", () => {
    render(<WorkspaceBlockAiPanel boardId="board" blockId="doc" blockType="doc" />);
    const button = screen.getByRole("button", { name: "Send (Enter)" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Improve introduction" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const [query, opts] = mocks.sendMessage.mock.calls[0];
    expect(query).toBe("Improve introduction");
    expect(opts.contextPrompt).toContain("id: doc, type: doc");
    expect(opts.contextPrompt).toContain("<p>Current document</p>");
    expect(opts.contextPrompt).not.toContain("Other selection");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("captures the latest document at send time", () => {
    render(<WorkspaceBlockAiPanel boardId="board" blockId="doc" blockType="doc" />);
    act(() => useWorkspaceStore.getState().updateBlock("doc", { data: { html: "<p>New edit</p>" } }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Shorten" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(mocks.sendMessage.mock.calls[0][1].contextPrompt).toContain("New edit");
  });

  it("targets the spreadsheet in full view", () => {
    act(() => useWorkspaceStore.setState({ blocks: {
      sheet: { id: "sheet", type: "table", data: { rows: 2, cols: 2, cells: [["A", "B"], ["10", "20"]] }, transform: { computed: null, override: {} }, createdAt: 1, updatedAt: 1 },
    } }));
    render(<WorkspaceBlockAiPanel boardId="board" blockId="sheet" blockType="table" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Double column B" } });
    fireEvent.click(screen.getByRole("button", { name: "Send (Enter)" }));
    expect(mocks.sendMessage.mock.calls[0][1].contextPrompt).toContain("id: sheet, type: table");
    expect(screen.getByRole("complementary", { name: "Spreadsheet AI assistant" })).toBeTruthy();
  });

  it("hides the composer for viewers and rejects a changed board or missing doc", () => {
    const view = render(<WorkspaceBlockAiPanel boardId="board" blockId="doc" blockType="doc" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Rewrite" } });
    act(() => useWorkspaceStore.setState({ boardId: "different" }));
    fireEvent.click(screen.getByRole("button", { name: "Send (Enter)" }));
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    act(() => useWorkspaceStore.setState({ boardId: "board", blocks: {} }));
    fireEvent.click(screen.getByRole("button", { name: "Send (Enter)" }));
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    act(() => useWorkspaceStore.setState({ isReadOnly: true }));
    view.rerender(<WorkspaceBlockAiPanel boardId="board" blockId="doc" blockType="doc" />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("supports stop, queued Enter, immediate Ctrl+Enter, and cancellation on exit", () => {
    mocks.activeRequest = {};
    const view = render(<WorkspaceBlockAiPanel boardId="board" blockId="doc" blockType="doc" />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(mocks.cancelCurrentRequest).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Queued" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(mocks.sendMessage).toHaveBeenCalledWith("Queued", expect.any(Object));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Immediate" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true });
    expect(mocks.sendMessageNow).toHaveBeenCalledWith("Immediate", expect.any(Object));
    view.unmount();
    expect(mocks.cancelCurrentRequest).toHaveBeenCalledTimes(2);
  });
});
