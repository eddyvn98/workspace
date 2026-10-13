import { afterEach, describe, expect, it, vi } from "vitest";
const inserted = vi.hoisted(() => vi.fn().mockResolvedValue({ inserted: 1 }));
vi.mock("@/lib/normalize-email", () => ({ normalizeEmail: (email: string) => email.toLowerCase() }));
vi.mock("@/services/mongodb/aiUsageEvents.repo", () => ({ insertUsageEvents: inserted }));
vi.mock("@/lib/ai-usage/server/department-lookup", () => ({ lookupDepartment: vi.fn().mockResolvedValue({ departmentId: null, departmentName: null, departmentIds: [] }) }));
import { buildUsageEventDoc, createUsageStreamObserver } from "@/lib/ai-usage/server/usage-recorder";
import type { DifyCapture } from "@/lib/ai-usage/server/dify-usage-extract";
const context = { email: "actor@example.test", category: "WORKSPACE_AGENT_CHAT_KEY", feature: "workspace-runtime-chat", workspaceTurnId: "turn-1" };
const capture: DifyCapture = { messageId: "message-1", conversationId: "conversation-1", workflowRunId: null, appMode: "advanced-chat", createdAt: null, usage: null, status: "success", nodeModels: [] };
const department = { departmentId: null, departmentName: null, departmentIds: [] };
afterEach(() => { vi.restoreAllMocks(); inserted.mockClear(); });
describe("Workspace usage correlation", () => {
  it("stores only bounded correlation and valid timing without changing dedupe identity", () => {
    const measured = buildUsageEventDoc({ ...context, observedDurationMs: 12.7 }, capture, "realtime", department)!;
    const old = buildUsageEventDoc({ email: context.email, category: context.category }, capture, "realtime", department)!;
    expect(measured._id).toBe(old._id);
    expect(measured.workspaceTurnId).toBe("turn-1");
    expect(measured.observedDurationMs).toBe(13);
    expect(old).not.toHaveProperty("observedDurationMs");
    expect(buildUsageEventDoc({ ...context, workspaceTurnId: "invalid secret!", observedDurationMs: Infinity }, capture, "realtime", department)).not.toHaveProperty("workspaceTurnId");
    expect(buildUsageEventDoc({ ...context, observedDurationMs: -1 }, capture, "realtime", department)).not.toHaveProperty("observedDurationMs");
  });
  it("measures consumed stream and records one capture despite repeated finish", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(250);
    const observer = createUsageStreamObserver(context, "text/event-stream");
    observer.onBytes(new TextEncoder().encode('data: {"event":"message_end","message_id":"message-1"}\n\n'));
    observer.finish("complete"); observer.finish("complete");
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledTimes(1));
    expect(inserted.mock.calls[0][0][0]).toMatchObject({ observedDurationMs: 150, workspaceTurnId: "turn-1", status: "success" });
    expect(clock).toHaveBeenCalledTimes(2);
  });
  it("capture failure does not throw into chat delivery", async () => {
    inserted.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const observer = createUsageStreamObserver(context, "text/event-stream");
    observer.onEvent({ event: "message", message_id: "message-1" });
    expect(() => observer.finish("aborted")).not.toThrow();
    await vi.waitFor(() => expect(inserted).toHaveBeenCalledTimes(1));
  });
});
