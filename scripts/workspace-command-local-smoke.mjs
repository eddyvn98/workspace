#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts/workspace-command.mjs");
const baseUrl = new URL(process.env.WORKSPACE_AGENT_URL ?? "http://localhost:3000");
assert(["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname), "Refusing to run: WORKSPACE_AGENT_URL must point to localhost");
const origin = baseUrl.origin;
const workspaceId = crypto.randomUUID();
const headers = { "content-type": "application/json", cookie: "mock-email=workspace-command-smoke%40example.test" };
const cliEnv = { ...process.env, WORKSPACE_AGENT_URL: origin, WORKSPACE_MOCK_EMAIL: "workspace-command-smoke@example.test" };
delete cliEnv.WORKSPACE_AGENT_SERVICE_KEY;
delete cliEnv.DIFY_SERVICE_KEY;
delete cliEnv.WORKSPACE_USER_TOKEN;
delete cliEnv.WORKSPACE_AGENT_USER_TOKEN;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-command-local-smoke-"));
let created = false;
let passed = 0;

async function request(method, suffix = "", body) {
  const response = await fetch(`${origin}/api/workspaces/${encodeURIComponent(workspaceId)}${suffix}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : {}; } catch { value = { raw: text }; }
  assert(response.ok, `${method} ${suffix || "/"} failed (${response.status}): ${JSON.stringify(value)}`);
  return value;
}

async function readBoard() {
  return request("GET");
}

function asRecord(value) {
  if (Array.isArray(value)) return Object.fromEntries(value.map((item) => [String(item.id), item]));
  return value && typeof value === "object" ? value : {};
}

async function replay(label, action, verify) {
  const before = await readBoard();
  const payloadPath = path.join(tempDir, `${String(passed).padStart(2, "0")}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ baseRevision: before.revision, actions: [action] }));
  const result = spawnSync(process.execPath, [cli, "run", workspaceId, payloadPath], { cwd: root, env: cliEnv, encoding: "utf8" });
  assert.equal(result.status, 0, `${label}: CLI failed: ${result.stderr || result.stdout}`);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.success, true, `${label}: mutation was not successful: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.actions?.[0]?.type, action.type, `${label}: receipt command mismatch`);
  assert.equal(receipt.actions?.[0]?.changed, true, `${label}: command reported no change`);
  assert(receipt.revision > before.revision, `${label}: revision did not advance`);
  const after = await readBoard();
  assert.equal(after.revision, receipt.revision, `${label}: persisted revision differs from receipt`);
  await verify(after, receipt, before);
  passed += 1;
  console.log(`PASS ${label} (rev ${before.revision} -> ${after.revision})`);
  return { after, receipt };
}

async function checkCapabilities() {
  const categories = ["content", "tree", "layout", "relationship", "map", "diagram", "presentation", "shape", "freehand", "history"];
  const result = spawnSync(process.execPath, [cli, "capabilities", workspaceId, ...categories], { cwd: root, env: cliEnv, encoding: "utf8" });
  assert.equal(result.status, 0, `capabilities CLI failed: ${result.stderr || result.stdout}`);
  const body = JSON.parse(result.stdout);
  assert.equal(body.success, true, `capabilities endpoint failed: ${JSON.stringify(body)}`);
  for (const category of categories) assert(body.selectedCategories?.includes(category), `capabilities missing category ${category}`);
  const advertised = new Set((body.capabilities ?? []).flatMap((item) => item.commands ?? []).map((item) => typeof item === "string" ? item : item.name));
  for (const command of ["update_node", "update_description", "add_child", "add_sibling", "delete_node", "duplicate_map", "copy_branch_to_map", "reorder_nodes", "undo", "redo", "update_transform", "connect_nodes", "create_map", "create_flowchart", "create_frame", "create_shape", "create_freehand"])
    assert(advertised.has(command), `capabilities catalog omitted ${command}`);
  console.log(`PASS capabilities (${categories.join(", ")})`);
}

try {
  const preflight = await fetch(`${origin}/api/workspaces/${workspaceId}`, { headers });
  assert.equal(preflight.status, 404, "Generated smoke board ID unexpectedly exists; refusing to overwrite it");

  const rootId = crypto.randomUUID();
  const peerId = crypto.randomUUID();
  const docId = crypto.randomUUID();
  const deckId = crypto.randomUUID();
  const slideId = crypto.randomUUID();
  const block = (id, type, data, x, y) => ({ id, type, data, transform: { computed: null, override: { x, y, w: 220, h: 100, rotation: 0, zIndex: 1 } }, createdAt: 1, updatedAt: 1 });
  const seeded = await request("PUT", "", {
    title: "Local command smoke", blocks: {
      [rootId]: block(rootId, "text", { markdown: "Root" }, 100, 100),
      [peerId]: block(peerId, "text", { markdown: "Peer" }, 400, 100),
      [docId]: block(docId, "doc", { html: "<p>Draft</p>" }, 100, 300),
      [deckId]: { ...block(deckId, "slideDeck", { title: "Smoke deck", aspectRatio: "16:9", activeSlideId: slideId, slideOrder: [slideId], slides: { [slideId]: { id: slideId, name: "Intro", html: "<h1>Intro</h1>" } } }, 500, 300), transform: { computed: null, override: { x: 500, y: 300, w: 640, h: 360, rotation: 0, zIndex: 1 } } },
    }, blockOrder: [rootId, peerId, docId, deckId], connectors: {}, camera: { x: 0, y: 0, zoom: 1 }, frames: [],
  });
  created = true;
  assert.equal(seeded.revision, 0, "New local board should start at revision 0");
  await checkCapabilities();

  await replay("rename board", { type: "rename_board", title: "Local command smoke updated" }, (board) => assert.equal(board.title, "Local command smoke updated"));
  await replay("update node content", { type: "update_node", blockId: rootId, text: "Root updated" }, (board) => assert.equal(asRecord(board.blocks)[rootId].data.markdown, "Root updated"));
  await replay("update style", { type: "update_style", blockId: rootId, style: { fontSize: 22, fontWeight: "bold" } }, (board) => assert.equal(asRecord(board.blocks)[rootId].data.fontSize, 22));
  await replay("update rich text", { type: "update_rich_text", blockId: docId, query: "Draft", marks: { bold: true } }, (board) => assert.match(asRecord(board.blocks)[docId].data.html, /<strong>Draft<\/strong>/));

  const childResult = await replay("add child", { type: "add_child", parentId: rootId, topic: "Smoke child" }, (board, receipt) => {
    const id = receipt.actions[0].ids.find((candidate) => candidate !== rootId);
    assert(id && asRecord(board.blocks)[id]?.parentId === rootId, "created child was not persisted beneath its parent");
  });
  const childId = childResult.receipt.actions[0].ids.find((candidate) => candidate !== rootId);
  const siblingResult = await replay("add sibling", { type: "add_sibling", target: childId, topic: "Smoke sibling" }, (board, receipt) => {
    const id = receipt.actions[0].ids.find((candidate) => candidate !== childId);
    assert(id && asRecord(board.blocks)[id]?.parentId === rootId, "sibling was not persisted beneath the shared parent");
  });
  const siblingId = siblingResult.receipt.actions[0].ids.find((candidate) => candidate !== childId);
  await replay("reorder children", { type: "reorder_nodes", target: rootId, nodes: [siblingId, childId] }, (board) => {
    const order = board.blockOrder.filter((id) => asRecord(board.blocks)[id]?.parentId === rootId);
    assert.deepEqual(order, [siblingId, childId]);
  });
  await replay("replace child order", { type: "replace_children", target: rootId, nodes: [childId, siblingId] }, (board) => {
    const order = board.blockOrder.filter((id) => asRecord(board.blocks)[id]?.parentId === rootId);
    assert.deepEqual(order, [childId, siblingId]);
  });
  const grandchildResult = await replay("add nested child", { type: "add_child", parentId: childId, topic: "Smoke grandchild" }, (board, receipt) => {
    const id = receipt.actions[0].ids.find((candidate) => candidate !== childId);
    assert(id && asRecord(board.blocks)[id]?.parentId === childId, "nested child was not persisted");
  });
  const grandchildId = grandchildResult.receipt.actions[0].ids.find((candidate) => candidate !== childId);
  const duplicateResult = await replay("duplicate subtree", { type: "duplicate_node", target: childId }, (board, receipt) => {
    const clonedRoot = receipt.actions[0].ids.find((id) => id !== childId && asRecord(board.blocks)[id]?.data.markdown === "Smoke child");
    const clonedChild = receipt.actions[0].ids.find((id) => id !== grandchildId && id !== childId && asRecord(board.blocks)[id]?.data.markdown === "Smoke grandchild");
    assert(clonedRoot && clonedChild && asRecord(board.blocks)[clonedChild].parentId === clonedRoot, "duplicate did not preserve the subtree hierarchy");
  });
  const clonedRootId = duplicateResult.receipt.actions[0].ids.find((id) => id !== childId && asRecord(duplicateResult.after.blocks)[id]?.data.markdown === "Smoke child");
  await replay("move duplicated subtree", { type: "move_node", target: clonedRootId }, (board) => assert.equal(asRecord(board.blocks)[clonedRootId].isFloating, true));
  await replay("delete subtree", { type: "delete_node", target: childId }, (board) => {
    assert.equal(asRecord(board.blocks)[childId], undefined);
    assert.equal(asRecord(board.blocks)[grandchildId], undefined);
    assert(asRecord(board.blocks)[siblingId], "deleting a branch must preserve its sibling");
  });
  for (const type of ["duplicate_map", "copy_branch_to_map"]) {
    await replay(type, { type, target: siblingId }, (board, receipt) => {
      const copiedRoot = receipt.actions[0].ids.find((id) => id !== siblingId && asRecord(board.blocks)[id]?.data.markdown === "Smoke sibling");
      assert(copiedRoot && asRecord(board.blocks)[copiedRoot].isFloating === true && !asRecord(board.blocks)[copiedRoot].parentId, `${type} did not create a detached map root`);
    });
  }
  await replay("update transform", { type: "update_transform", blockId: rootId, x: 123, y: 234, rotation: 12 }, (board) => {
    const transform = asRecord(board.blocks)[rootId].transform.override;
    assert.equal(transform.x, 123); assert.equal(transform.y, 234); assert.equal(transform.rotation, 12);
  });
  await replay("update z order", { type: "update_z_order", blockId: rootId, zOrder: "front" }, (board) => assert.equal(board.blockOrder.at(-1), rootId));
  await replay("arrange selection", { type: "arrange_selection", blockIds: [rootId, peerId], mode: "timeline", gap: 80 }, (board) => assert(asRecord(board.blocks)[peerId].transform.override.x > asRecord(board.blocks)[rootId].transform.override.x));

  await replay("connect nodes", { type: "connect_nodes", from: rootId, to: peerId, lineLabel: "Before", lineWidth: 2 }, (board) => assert(Object.values(asRecord(board.connectors)).some((item) => item.fromBlockId === rootId && item.toBlockId === peerId)));
  await replay("update relationship", { type: "update_relationship", from: rootId, to: peerId, relationshipPatch: { lineLabel: "Reviewed", lineColor: "#ef4444", lineWidth: 3 } }, (board) => assert(Object.values(asRecord(board.connectors)).some((item) => item.label === "Reviewed" && item.strokeColor === "#ef4444")));
  await replay("disconnect nodes", { type: "disconnect_nodes", from: rootId, to: peerId }, (board) => assert.equal(Object.values(asRecord(board.connectors)).some((item) => item.fromBlockId === rootId && item.toBlockId === peerId), false));

  const shapeResult = await replay("create shape", { type: "create_shape", shapeType: "rectangle", text: "Smoke shape" }, (board, receipt) => assert.equal(asRecord(board.blocks)[receipt.actions[0].ids[0]].data.label, "Smoke shape"));
  const shapeId = shapeResult.receipt.actions[0].ids[0];
  await replay("update shape", { type: "update_shape", target: shapeId, shapeType: "ellipse", text: "Updated shape" }, (board) => assert.equal(asRecord(board.blocks)[shapeId].data.shapeKind, "ellipse"));
  const shapeCopy = await replay("duplicate shape", { type: "duplicate_shape", target: shapeId }, (board, receipt) => assert(receipt.actions[0].ids.some((id) => id !== shapeId && asRecord(board.blocks)[id])));
  const shapeCopyId = shapeCopy.receipt.actions[0].ids.find((id) => id !== shapeId);
  await replay("delete shape", { type: "delete_shape", target: shapeCopyId }, (board) => assert.equal(asRecord(board.blocks)[shapeCopyId], undefined));

  const strokeResult = await replay("create freehand", { type: "create_freehand", points: [{ x: 8, y: 8 }, { x: 100, y: 60 }], x: 700, y: 100, color: "#2563eb", strokeWidth: 6 }, (board, receipt) => assert.equal(asRecord(board.blocks)[receipt.actions[0].ids[0]].data.points.length, 2));
  const strokeId = strokeResult.receipt.actions[0].ids[0];
  await replay("update freehand", { type: "update_freehand", target: strokeId, points: [{ x: 0, y: 0 }, { x: 40, y: 80 }], strokeWidth: 9 }, (board) => assert.equal(asRecord(board.blocks)[strokeId].data.strokeWidth, 9));
  const strokeCopy = await replay("duplicate freehand", { type: "duplicate_freehand", target: strokeId }, (board, receipt) => assert(receipt.actions[0].ids.some((id) => id !== strokeId && asRecord(board.blocks)[id])));
  const strokeCopyId = strokeCopy.receipt.actions[0].ids.find((id) => id !== strokeId);
  await replay("delete freehand", { type: "delete_freehand", target: strokeCopyId }, (board) => assert.equal(asRecord(board.blocks)[strokeCopyId], undefined));

  await replay("create frame one", { type: "create_frame", name: "Frame One", camera: { x: 10, y: 20, zoom: 1 } }, (board) => assert.equal(board.frames.length, 1));
  const firstFrameId = (await readBoard()).frames[0].id;
  await replay("create frame two", { type: "create_frame", name: "Frame Two" }, (board) => assert.equal(board.frames.length, 2));
  const frameIds = (await readBoard()).frames.map((frame) => frame.id);
  await replay("reorder frames", { type: "reorder_frames", frameIds: [...frameIds].reverse() }, (board) => assert.deepEqual(board.frames.map((frame) => frame.id), [...frameIds].reverse()));
  await replay("update frame", { type: "update_frame", frameId: firstFrameId, name: "Frame One Updated" }, (board) => assert.equal(board.frames.find((frame) => frame.id === firstFrameId).name, "Frame One Updated"));
  const secondFrameId = frameIds.find((id) => id !== firstFrameId);
  await replay("delete frame", { type: "delete_frame", frameId: secondFrameId }, (board) => assert.equal(board.frames.some((frame) => frame.id === secondFrameId), false));

  await replay("update slide", { type: "update_slide", deckId, slideId, name: "Intro updated", html: "<h1>Ready</h1>", presenterNotes: "Local smoke" }, (board) => assert.equal(asRecord(board.blocks)[deckId].data.slides[slideId].name, "Intro updated"));
  const addedSlide = await replay("add slide", { type: "add_slide", deckId, name: "Next", html: "<p>Next</p>", afterSlideId: slideId }, (board) => assert.equal(asRecord(board.blocks)[deckId].data.slideOrder.length, 2));
  const newSlideId = asRecord(addedSlide.after.blocks)[deckId].data.slideOrder.find((id) => id !== slideId);
  await replay("reorder slides", { type: "reorder_slides", deckId, slideOrder: [newSlideId, slideId] }, (board) => assert.deepEqual(asRecord(board.blocks)[deckId].data.slideOrder, [newSlideId, slideId]));
  await replay("update slide deck", { type: "update_slide_deck", deckId, title: "Smoke deck updated", aspectRatio: "4:3" }, (board) => assert.equal(asRecord(board.blocks)[deckId].data.aspectRatio, "4:3"));
  await replay("delete slide", { type: "delete_slide", deckId, slideId: newSlideId }, (board) => assert.deepEqual(asRecord(board.blocks)[deckId].data.slideOrder, [slideId]));

  await replay("update description", { type: "update_description", blockId: rootId, description: "History checkpoint" }, (board) => assert.equal(asRecord(board.blocks)[rootId].description, "History checkpoint"));
  await replay("undo", { type: "undo" }, (board) => assert.equal(asRecord(board.blocks)[rootId].description, undefined));
  await replay("redo", { type: "redo" }, (board) => assert.equal(asRecord(board.blocks)[rootId].description, "History checkpoint"));

  console.log(`PASS local CLI replay: ${passed} mutations; independent persisted read after every receipt; final revision ${(await readBoard()).revision}`);
} finally {
  if (created) {
    const deleted = await request("DELETE");
    assert.equal(deleted.ok, true, "Smoke board cleanup failed");
    const check = await fetch(`${origin}/api/workspaces/${workspaceId}`, { headers });
    assert.equal(check.status, 404, "Smoke board still exists after cleanup");
    console.log("PASS disposable smoke board removed and verified absent");
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
