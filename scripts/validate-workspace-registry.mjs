import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync("config/workspace-command-registry.json", "utf8"));
assert.ok(Number.isInteger(registry.version) && registry.version > 0, "Registry version must be positive");
assert.ok(Array.isArray(registry.commands) && registry.commands.length > 0, "Command registry must not be empty");

const names = new Set();
const categories = new Set();
for (const command of registry.commands) {
  assert.ok(command && typeof command === "object", "Invalid command entry");
  assert.match(command.name ?? "", /^[a-z][a-z0-9_]*$/, "Invalid command name");
  assert.ok(!names.has(command.name), `Duplicate Workspace command: ${command.name}`);
  assert.match(command.category ?? "", /^[a-z][a-z0-9_]*$/, `Invalid category for ${command.name}`);
  assert.ok(typeof command.target === "string" && command.target.length > 0,
    `Missing target for ${command.name}`);
  assert.equal(typeof command.mutation, "boolean", `Missing mutation flag for ${command.name}`);
  names.add(command.name);
  categories.add(command.category);
}
console.log(JSON.stringify({ registryVersion: registry.version, commandCount: names.size,
  categories: [...categories].sort(), status: "ok" }, null, 2));
