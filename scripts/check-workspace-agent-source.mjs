import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import YAML from "../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js";

const read = (file) => fs.readFileSync(file, "utf8");
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => crypto.createHash("sha256")
  .update(JSON.stringify(canonical(value))).digest("hex");

const artifactFile = "workspace-agent-company-all-models-with-evidence.yml";
const harnessFile = "workspace-agent-local-nonmodel-harness.yml";
const sourceDir = "docs/dify/workspace-agent-company-source";
const artifact = YAML.parse(read(artifactFile));
const harness = YAML.parse(read(harnessFile));
const manifest = JSON.parse(read(`${sourceDir}/manifest.json`));
const graph = artifact?.workflow?.graph;
const harnessGraph = harness?.workflow?.graph;

assert.equal(manifest.source, artifactFile, "DSL manifest points to a different artifact");
assert.equal(manifest.sourceSemanticSha256, digest(artifact), "DSL artifact drifted from its manifest");
assert.equal(manifest.nodeCount, graph?.nodes?.length, "DSL manifest node count is stale");
assert.equal(manifest.agentCount, graph?.nodes?.filter((node) => node.data?.type === "agent").length, "DSL manifest agent count is stale");
assert.equal(harness?.app?.name, "WORKSPACE - AGENT (LOCAL NON-MODEL HARNESS)", "Local harness identity is missing");
assert.notEqual(harness?.app?.name, artifact?.app?.name, "Local harness must not be used as the import artifact");
assert.deepEqual(harnessGraph?.edges?.length, graph?.edges?.length, "Harness topology drifted from the source artifact");

console.log(JSON.stringify({
  artifact: artifactFile,
  sourceDir,
  agentCount: manifest.agentCount,
  nodeCount: manifest.nodeCount,
  harness: harnessFile,
  status: "ok",
}));
