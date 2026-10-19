import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { config as loadEnv } from "dotenv";
import { authenticatePeer, isInternalAuthorized, readConfig, validBoardId, type WorkspaceWsConfig } from "./config";
import { attachPeer } from "./protocol";
import { WorkspaceRooms, type WorkspaceRepository } from "./registry";
import { RepositoryError } from "./repository";
import type { RoomPeer } from "./rooms";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}
async function readBody(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (Number(request.headers["content-length"] || 0) > limit) throw new RepositoryError(413, "payload_too_large");
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength; if (total > limit) throw new RepositoryError(413, "payload_too_large");
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RepositoryError(400, "invalid_body");
  return value as Record<string, unknown>;
}
function rejectUpgrade(socket: Duplex, status: number): void {
  if (socket.destroyed) return;
  const reason = status === 401 ? "Unauthorized" : status === 404 ? "Not Found" : "Service Unavailable";
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
export function createWorkspaceWsService(config: WorkspaceWsConfig, repository?: WorkspaceRepository,
  log: (message: string, error?: unknown) => void = console.warn) {
  const rooms = new WorkspaceRooms(config, repository, log);
  const peers = new WeakMap<object, RoomPeer>();
  const websockets = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes, perMessageDeflate: false });
  let stopping = false;
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url || "/", "http://localhost").pathname;
      if (request.method === "GET" && path === "/health") { json(response, stopping ? 503 : 200, { ok: !stopping }); return; }
      if (request.method !== "POST" || !["/internal/workspace-agent-patch", "/internal/workspace-access-changed"].includes(path)) {
        json(response, 404, { error: "Not found" }); return;
      }
      if (!isInternalAuthorized(request.headers.authorization, config.secret)) { json(response, 401, { error: "Unauthorized" }); return; }
      const body = await readBody(request, config.maxHttpBytes);
      if (!validBoardId(body.boardId)) { json(response, 400, { error: "Invalid boardId" }); return; }
      if (path.endsWith("workspace-access-changed")) {
        if (typeof body.userEmail !== "string" || !body.userEmail.trim() || body.userEmail.length > 320) {
          json(response, 400, { error: "Invalid userEmail" }); return;
        }
        const evicted = rooms.evict(body.boardId, body.userEmail); json(response, 200, { ok: true, evicted });
      } else {
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) { json(response, 400, { error: "Invalid revision" }); return; }
        // The persisted snapshot is authoritative. Notification payloads only invalidate the cached revision.
        await rooms.refresh(body.boardId, Number(body.revision)); json(response, 200, { ok: true });
      }
    })().catch((error) => {
      if (!response.headersSent && !response.destroyed) json(response,
        error instanceof RepositoryError ? error.status : error instanceof SyntaxError ? 400 : 503,
        { error: error instanceof RepositoryError ? error.reason : "Request failed" });
      if (!(error instanceof SyntaxError)) log("[workspace-ws] Internal request failed", error);
    });
  });
  server.requestTimeout = config.requestTimeoutMs + 5000; server.headersTimeout = 10_000; server.maxHeadersCount = 50;
  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => socket.destroy());
    void (async () => {
      if (stopping) { rejectUpgrade(socket, 503); return; }
      const url = new URL(request.url || "/", "http://localhost");
      const match = /^\/workspace\/([^/]+)$/.exec(url.pathname);
      const boardId = match ? decodeURIComponent(match[1]) : "";
      if (!validBoardId(boardId)) { rejectUpgrade(socket, 404); return; }
      const identity = await authenticatePeer(url.searchParams.get("token"), boardId, config.secret);
      if (socket.destroyed) return;
      if (!rooms.canJoin(identity)) { rejectUpgrade(socket, 401); return; }
      const room = await rooms.get(boardId);
      if (socket.destroyed) return;
      if (!rooms.canJoin(identity)) { rejectUpgrade(socket, 401); return; }
      if (stopping || room.closed || room.peers.size >= config.maxClientsPerRoom) { rejectUpgrade(socket, 503); return; }
      websockets.handleUpgrade(request, socket, head, (websocket) => {
        peers.set(websocket, attachPeer(room, websocket, identity, () => rooms.changed(boardId)));
      });
    })().catch((error) => {
      if (error instanceof RepositoryError) { log("[workspace-ws] Could not open room", error); rejectUpgrade(socket, error.status === 404 ? 404 : 503); }
      else rejectUpgrade(socket, 401);
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of websockets.clients) {
      const peer = peers.get(socket);
      if (!peer || !peer.alive) { socket.terminate(); continue; }
      peer.alive = false; socket.ping();
    }
  }, 15_000);
  heartbeat.unref();
  return {
    server, rooms,
    listen: () => new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => { server.off("error", failed); reject(error); };
      server.once("error", failed);
      server.listen(config.port, config.host, () => { server.off("error", failed); resolve(); });
    }),
    async stop(): Promise<void> {
      stopping = true; clearInterval(heartbeat); server.close();
      await rooms.shutdown();
      for (const socket of websockets.clients) socket.terminate();
      await new Promise<void>((resolve) => websockets.close(() => resolve()));
    },
  };
}

if (process.argv[1] && /(?:^|[/\\])workspace-ws[/\\]index\.(?:ts|js)$/.test(process.argv[1])) {
  loadEnv({ path: ".env.local", quiet: true }); loadEnv({ path: ".env", quiet: true });
  const config = readConfig(), service = createWorkspaceWsService(config);
  void service.listen().then(() => console.info(`[workspace-ws] Listening on ${config.host}:${config.port}`)).catch((error) => {
    console.error("[workspace-ws] Startup failed", error); process.exitCode = 1;
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    void service.stop().catch((error) => {
      console.error("[workspace-ws] Shutdown paused while pending saves retry", error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
