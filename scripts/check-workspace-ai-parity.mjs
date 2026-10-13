import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const registry = readJson("config/workspace-command-registry.json");
const parity = readJson("config/workspace-ai-parity.json");
const allowedStatuses = new Set(parity.statusValues);
const rows = parity.capabilities;
const rowIds = new Set();
const mappedCommands = new Set();

assert.ok(rows.length > 0, "Workspace parity matrix is empty");
assert.ok(parity.executorPath, "Workspace parity matrix is missing the shared executor path");
assert.ok(parity.contractPath, "Workspace parity matrix is missing the shared contract path");
for (const row of rows) {
  assert.ok(row.id && !rowIds.has(row.id), `Parity row id is missing or duplicated: ${row.id}`);
  rowIds.add(row.id);
  assert.ok(allowedStatuses.has(row.status), `Unknown parity status for ${row.id}: ${row.status}`);
  assert.ok(row.ui, `Parity row ${row.id} is missing its UI surface`);
  assert.ok(Array.isArray(row.registryCommands), `Parity row ${row.id} must declare registryCommands`);
  for (const command of row.registryCommands) mappedCommands.add(command);
  if (row.status === "covered") {
    assert.ok(row.registryCommands.length > 0, `Covered row ${row.id} has no AI command`);
    assert.notEqual(row.verification, "none", `Covered row ${row.id} has no verification evidence`);
    assert.ok(row.test, `Covered row ${row.id} must name test evidence`);
    const testFiles = row.test.split(";").map((file) => file.trim()).filter(Boolean);
    assert.ok(testFiles.length > 0, `Covered row ${row.id} has no test file paths`);
    for (const file of testFiles) {
      assert.ok(fs.existsSync(path.join(root, file)), `Covered row ${row.id} references a missing test file: ${file}`);
    }
  }
  if ((row.status === "missing" || row.status === "partial") && !row.notes) {
    throw new Error(`Open parity gap ${row.id} must explain what remains`);
  }
}

const registryNames = registry.commands.map((command) => command.name);
const unmappedCommands = registryNames.filter((name) => !mappedCommands.has(name));
assert.deepEqual(unmappedCommands, [], "Every registered AI command must appear in the parity matrix");

const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, rows.filter((row) => row.status === status).length]));
const gaps = rows.filter((row) => row.status === "missing" || row.status === "partial").map((row) => row.id);
console.log(JSON.stringify({ matrixVersion: parity.version, scope: parity.scope ?? "registered-command-contract-readiness", productAcceptanceMatrix: parity.productAcceptanceMatrix, rows: rows.length, registryCommands: registryNames.length, executorPath: parity.executorPath, contractPath: parity.contractPath, counts, gaps, status: gaps.length === 0 ? "closed" : "open" }, null, 2));
if (process.argv.includes("--strict") && gaps.length > 0) process.exit(1);
