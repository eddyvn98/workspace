// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/child-components/ai-select-models", () => ({
  AIActionLauncher: () => <div data-testid="ai-launcher" />,
}));
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

import { WorkspaceChatInput } from "@/app/workspace/components/WorkspaceChatInput";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

describe("WorkspaceChatInput component", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.replaceChildren();
  });

  function TestComposer({
    initialDraft = "",
    onSend = vi.fn(),
  }: {
    initialDraft?: string;
    onSend?: () => void;
  }) {
    const [draft, setDraft] = useState(initialDraft);
    const inputRef = React.useRef<HTMLTextAreaElement>(null);

    return (
      <WorkspaceChatInput
        draft={draft}
        setDraft={setDraft}
        isSending={false}
        onSend={onSend}
        inputRef={inputRef}
      />
    );
  }

  it("handles sequential character input without Maximum update depth exceeded errors", () => {
    const errorSpy = vi.spyOn(console, "error");
    root = createRoot(container);
    act(() => {
      root.render(<TestComposer />);
    });

    const textarea = container.querySelector("textarea")!;
    expect(textarea).not.toBeNull();

    const sample = "Create a task for audit";
    for (let i = 1; i <= sample.length; i++) {
      act(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(textarea, sample.slice(0, i));
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    expect(textarea.value).toBe(sample);
    const depthErrors = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("Maximum update depth"))
    );
    expect(depthErrors).toHaveLength(0);
  });

  it("disables send when empty and enables when text is typed", () => {
    const onSend = vi.fn();
    root = createRoot(container);
    act(() => {
      root.render(<TestComposer onSend={onSend} />);
    });

    const sendBtn = container.querySelector("button[aria-label='Send (Enter)']") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    const textarea = container.querySelector("textarea")!;
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, "Hello AI");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(sendBtn.disabled).toBe(false);
  });

  it("triggers onSend on plain Enter and allows multiline on Shift+Enter", () => {
    const onSend = vi.fn();
    root = createRoot(container);
    act(() => {
      root.render(<TestComposer initialDraft="Send this prompt" onSend={onSend} />);
    });

    const textarea = container.querySelector("textarea")!;

    // Shift+Enter should NOT send
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    });
    expect(onSend).not.toHaveBeenCalled();

    // Plain Enter should send
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, bubbles: true }));
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
