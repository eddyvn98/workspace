// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useWorkspaceSpreadsheetExternalSync } from "@/app/workspace/components/table/useWorkspaceSpreadsheetExternalSync";

afterEach(cleanup);

describe("Workspace spreadsheet external sync", () => {
  it("remounts from a remote snapshot without mutating or passing it to Fortune Sheet", () => {
    const lastEmittedRef = { current: "local-before" };
    const { result, rerender } = renderHook(
      ({ dataSignature }: { dataSignature: string }) =>
        useWorkspaceSpreadsheetExternalSync({ dataSignature, lastEmittedRef }),
      { initialProps: { dataSignature: "local-before" } },
    );

    expect(result.current).toBe(0);
    rerender({ dataSignature: "remote-after" });

    expect(result.current).toBe(1);
    expect(lastEmittedRef.current).toBe("remote-after");
  });

  it("does not remount when the incoming projection is the local save", () => {
    const lastEmittedRef = { current: "local-before" };
    const { result, rerender } = renderHook(
      ({ dataSignature }: { dataSignature: string }) =>
        useWorkspaceSpreadsheetExternalSync({ dataSignature, lastEmittedRef }),
      { initialProps: { dataSignature: "local-before" } },
    );

    lastEmittedRef.current = "local-save";
    rerender({ dataSignature: "local-save" });

    expect(result.current).toBe(0);
  });
});
