/**
 * Emit a machine-readable acceptance matrix for every registered Workspace AI
 * action. Registry membership is NOT evidence of runtime support.
 * Usage: node scripts/workspace-command-audit.mjs [--json]
 */
import { readFileSync } from "node:fs";
const registry = JSON.parse(readFileSync(new URL("../config/workspace-command-registry.json", import.meta.url), "utf8"));
if (!Array.isArray(registry.commands)) throw new Error("Workspace registry missing commands");
const seen = new Set();
const rows = registry.commands.map(({ name, category, target, mutation }) => {
  if (typeof name !== "string" || seen.has(name)) throw new Error("Invalid or duplicate command: " + name);
  seen.add(name);
  return {
    name, category, target, declaredMutation: mutation,
    schema: "UNVERIFIED", executor: "UNVERIFIED", permission: "UNVERIFIED",
    persistedReceipt: "UNVERIFIED", roleMatrix: "UNVERIFIED",
    realStagingE2E: "UNVERIFIED", evidence: "",
  };
});
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ registryVersion: registry.version, commandCount: rows.length, commands: rows }, null, 2) + "\n");
} else {
  process.stdout.write(`# Workspace agent command acceptance matrix\n\nRegistry v${registry.version} · ${rows.length} entries. All proof columns default to UNVERIFIED.\n\n`);
  process.stdout.write("| Command | Category | Target | Registry mutation | Schema | Executor | ACL | Persisted receipt | Role E2E | Staging E2E |\n");
  process.stdout.write("|---|---|---|---|---|---|---|---|---|---|\n");
  for (const item of rows) process.stdout.write(
    `| ${item.name} | ${item.category} | ${item.target} | ${item.declaredMutation} | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |\n`,
  );
}
