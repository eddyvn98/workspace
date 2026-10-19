// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useJsonBackup } from "@/app/workspace/hooks/useJsonBackup";

const fixture = vi.hoisted(() => ({ state: { boardId: "first", isReadOnly: false }, setState: vi.fn() }));
vi.mock("@/app/workspace/store/useWorkspaceStore", () => ({
  useWorkspaceStore: { getState: () => fixture.state, setState: fixture.setState },
}));
vi.mock("@/app/workspace/utils/workspacePerfDebug", () => ({ workspacePerfLog: vi.fn() }));

let root: Root | null = null, host: HTMLDivElement | null = null;
let actions: ReturnType<typeof useJsonBackup>;
let loaded: ((event: { target: { result: string } }) => void) | null = null;
const backup = JSON.stringify({ title: "Imported", blocks: { doc: { type: "doc", data: { html: "<p>Backup text</p>" } } }, blockOrder: ["doc"], connectors: {} });
function Harness() { actions = useJsonBackup(); return null; }
beforeEach(async () => {
  fixture.state = { boardId: "first", isReadOnly: false }; fixture.setState.mockClear(); loaded = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("FileReader", class {
    onload: typeof loaded = null;
    readAsText() { loaded = this.onload; }
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<Harness />); });
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = null; host?.remove(); host = null; vi.unstubAllGlobals();
});

it("does not apply a backup to a different board opened while FileReader was pending", () => {
  actions.importJson(new File([backup], "backup.json"));
  expect(loaded).toBeTypeOf("function");
  fixture.state = { boardId: "second", isReadOnly: false };
  loaded!({ target: { result: backup } });
  expect(fixture.setState).not.toHaveBeenCalled();
});

it("applies the backup when the initiating board is still active and editable", () => {
  actions.importJson(new File([backup], "backup.json")); loaded!({ target: { result: backup } });
  expect(fixture.setState).toHaveBeenCalledWith(expect.objectContaining({ title: "Imported", blockOrder: ["doc"],
    blocks: { doc: { type: "doc", data: { html: "<p>Backup text</p>" } } } }));
});

it("discards a pending backup after the same board becomes readonly", () => {
  actions.importJson(new File([backup], "backup.json"));
  fixture.state = { boardId: "first", isReadOnly: true }; loaded!({ target: { result: backup } });
  expect(fixture.setState).not.toHaveBeenCalled();
});
