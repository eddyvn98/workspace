// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { connectWorkspaceBoard, type WorkspaceLiveHandle } from "@/lib/workspace/ydoc";
import { createDocumentRoom } from "@/lib/workspace/document-room";
import { documentFragments } from "@/lib/workspace/ydoc-documents";
import { getDocumentSession } from "@/lib/workspace/document-session";
import { workspaceDocMaps, type PlainBoard } from "@/lib/workspace/ydoc-shapes";

interface Socket {
  emit: (event: string, ...values: unknown[]) => void;
  wsconnected: boolean;
  shouldConnect: boolean;
  params: { token: string };
  disconnect: () => void;
}
const sockets = vi.hoisted(() => ({ instances: [] as Socket[] }));
vi.mock("y-websocket", () => ({ WebsocketProvider: class {
  wsconnected = true; shouldConnect = true;
  listeners = new Map<string, Set<(...values: unknown[]) => void>>();
  awareness = { setLocalState: vi.fn(), getStates: () => new Map(), on: vi.fn(), off: vi.fn() };
  params: { token: string };
  constructor(_url: unknown, _room: unknown, _doc: unknown, options: { params: { token: string } }) {
    this.params = options.params; sockets.instances.push(this);
  }
  on(event: string, listener: (...values: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }
  off(event: string, listener: (...values: unknown[]) => void) { this.listeners.get(event)?.delete(listener); }
  emit(event: string, ...values: unknown[]) { [...(this.listeners.get(event) ?? [])].forEach(listener => listener(...values)); }
  disconnect() { this.wsconnected = false; this.shouldConnect = false; this.emit("sync", false); }
  connect() { this.wsconnected = true; this.shouldConnect = true; }
  destroy() { this.disconnect(); this.listeners.clear(); }
} }));

const handles: WorkspaceLiveHandle[] = [], docs: Y.Doc[] = [];
afterEach(() => {
  handles.splice(0).forEach(handle => handle.destroy());
  docs.splice(0).forEach(doc => doc.destroy()); sockets.instances.length = 0; vi.useRealTimers();
});
function board(html = '<p data-line-id="line">Original</p>'): PlainBoard {
  return { title: "Board", revision: 1, blocks: { doc: { id: "doc", type: "doc", data: { html } } }, connectors: {}, blockOrder: ["doc"] };
}
function connect(options: Partial<Parameters<typeof connectWorkspaceBoard>[0]> = {}) {
  const onBoard = vi.fn(), onSync = vi.fn(), onPreSyncChanges = vi.fn();
  const handle = connectWorkspaceBoard({ boardId: "board", token: "token", wsUrl: "ws://example.test", requireDocumentProtocol: true,
    onBoard, onSyncStateChange: onSync, onPreSyncChanges, ...options });
  handles.push(handle); return { handle, socket: sockets.instances.at(-1)!, onBoard, onSync, onPreSyncChanges };
}
function syncRoom(handle: WorkspaceLiveHandle, socket: Socket, content = board()) {
  const server = createDocumentRoom(content); docs.push(server);
  Y.applyUpdate(handle.doc, Y.encodeStateAsUpdate(server), "remote"); socket.emit("sync", true); return server;
}
function firstText(doc: Y.Doc): Y.XmlText {
  return (documentFragments(doc).get("doc")!.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}

describe("document client session integration", () => {
  it("adopts a protocol-v1 room without overwriting newer peer content with initial HTML", () => {
    const { handle, socket, onBoard, onSync } = connect({ initialBoard: board() });
    syncRoom(handle, socket, board('<p data-line-id="line">Original with newer peer edits</p>'));
    expect(firstText(handle.doc).toString()).toBe("Original with newer peer edits");
    expect(onBoard).toHaveBeenLastCalledWith(expect.objectContaining({ blocks: board('<p data-line-id="line">Original with newer peer edits</p>').blocks }), { local: false, crdt: true });
    expect(onSync).toHaveBeenLastCalledWith(true);
    expect(getDocumentSession()?.doc).toBe(handle.doc);
  });

  it("ignores sync=false as an initial handshake and still accepts the first successful sync", () => {
    const { handle, socket, onBoard, onSync } = connect();
    socket.emit("sync", false);
    expect(onBoard).not.toHaveBeenCalled(); expect(getDocumentSession()).toBeNull();
    expect(onSync).toHaveBeenLastCalledWith(false);
    syncRoom(handle, socket);
    expect(onBoard).toHaveBeenCalledTimes(1);
    expect(onSync).toHaveBeenLastCalledWith(true);
  });

  it("buffers pre-sync edits and requests a REST flush without projecting or transmitting stale HTML", () => {
    const { handle, socket, onBoard, onSync, onPreSyncChanges } = connect();
    handle.publish(board(), board('<p data-line-id="line">Local while connecting</p>'));
    expect(workspaceDocMaps(handle.doc).blocks.size).toBe(0);
    expect(documentFragments(handle.doc).size).toBe(0);
    syncRoom(handle, socket);
    expect(onPreSyncChanges).toHaveBeenCalledTimes(1);
    expect(onBoard).not.toHaveBeenCalled(); expect(onSync).toHaveBeenLastCalledWith(false);
    expect(socket.wsconnected).toBe(false); expect(getDocumentSession()).toBeNull();
    socket.emit("sync", true);
    expect(onPreSyncChanges).toHaveBeenCalledTimes(1); expect(onBoard).not.toHaveBeenCalled();
  });

  it("also defers a known unsaved initial snapshot to the REST recovery path", () => {
    const { handle, socket, onBoard, onPreSyncChanges } = connect({ initialBoard: board("<p>Unsaved</p>"), hasPendingInitialChanges: true });
    syncRoom(handle, socket);
    expect(onPreSyncChanges).toHaveBeenCalledOnce(); expect(onBoard).not.toHaveBeenCalled();
  });

  it("keeps the editor's fragment bound offline and distinguishes local from remote projections", () => {
    const { handle, socket, onBoard } = connect();
    const server = syncRoom(handle, socket); onBoard.mockClear();
    socket.disconnect();
    firstText(handle.doc).insert(0, "Offline ");
    expect(getDocumentSession()?.doc).toBe(handle.doc);
    expect(onBoard).toHaveBeenLastCalledWith(expect.anything(), { local: true, crdt: true });
    firstText(server).insert(firstText(server).length, " remote");
    Y.applyUpdate(handle.doc, Y.encodeStateAsUpdate(server), "remote");
    expect(onBoard).toHaveBeenLastCalledWith(expect.anything(), { local: false, crdt: true });
    expect(firstText(handle.doc).toString()).toBe("Offline Original remote");
  });

  it("marks actual collaborative deletions pending until their persistence vector is received", async () => {
    vi.useFakeTimers();
    const { handle, socket } = connect(); syncRoom(handle, socket);
    firstText(handle.doc).delete(0, 1);
    expect(handle.doc.getMap("documentEdits").size).toBeGreaterThan(0);
    const captured = Buffer.from(Y.encodeStateVector(handle.doc)).toString("base64");
    const pending = handle.awaitPersisted(100);
    workspaceDocMaps(handle.doc).meta.set("docPersistedVector", captured);
    await expect(pending).resolves.toBe(true);
  });

  it("refuses a legacy room when the board requires document collaboration", () => {
    const { handle, socket, onBoard, onSync } = connect();
    workspaceDocMaps(handle.doc).meta.set("boardRevision", 1); socket.emit("sync", true);
    expect(socket.wsconnected).toBe(false); expect(onBoard).not.toHaveBeenCalled();
    expect(onSync).toHaveBeenLastCalledWith(false); expect(getDocumentSession()).toBeNull();
  });

  it("resumes a paused reconnect after a transient token refresh failure recovers", async () => {
    vi.useFakeTimers();
    const refreshToken = vi.fn().mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue({ token: "fresh-token" });
    const { socket } = connect({ refreshToken });
    socket.wsconnected = false;
    socket.emit("connection-close");
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(socket.shouldConnect).toBe(false);
    expect(socket.wsconnected).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(refreshToken).toHaveBeenCalledTimes(2);
    expect(socket.wsconnected).toBe(true);
    expect(socket.params.token).toBe("fresh-token");
  });

  it("does not reopen a destroyed session when an outstanding token refresh returns", async () => {
    let resolve!: (value: { token: string }) => void;
    const refreshToken = vi.fn(() => new Promise<{ token: string }>(complete => { resolve = complete; }));
    const { handle, socket } = connect({ refreshToken });
    socket.wsconnected = false; socket.emit("connection-close");
    handle.destroy(); handles.splice(handles.indexOf(handle), 1);
    resolve({ token: "too-late" });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(socket.shouldConnect).toBe(false);
    expect(socket.wsconnected).toBe(false);
    expect(socket.params.token).toBe("token");
  });
});
