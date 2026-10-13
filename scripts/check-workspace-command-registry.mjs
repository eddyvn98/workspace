import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registry = JSON.parse(read("config/workspace-command-registry.json"));
const names = registry.commands.map((command) => command.name);
assert.equal(new Set(names).size, names.length, "The command registry contains duplicate names");

const parser = read("app/workspace/utils/workspaceChatActions.ts");
assert.ok(parser.includes("workspace-command-registry"), "The client parser is not connected to the command registry");
assert.ok(parser.includes("WORKSPACE_COMMAND_NAME_SET"), "The client parser does not use the command registry set");

const openApi = YAML.parse(read("docs/dify/workspace-agent-custom-tool.openapi.yaml"));
assert.equal(openApi["x-workspace-command-registry-version"], registry.version, "OpenAPI contract is not generated from the current registry version");
const readPath = openApi.paths["/api/workspaces/{workspace_id}"];
assert.ok(readPath, "OpenAPI must use the same workspace_id name as the Workspace Agent input");
const readOperation = readPath.get;
const workspaceIdParameter = openApi.components.parameters.WorkspaceBoardId;
assert.equal(workspaceIdParameter.name, "workspace_id", "Workspace path parameter must match the runtime input name");
assert.equal(workspaceIdParameter.in, "path", "Workspace ID must remain a path parameter");
const userTokenParameter = readOperation.parameters
  .map((reference) => typeof reference === "object" && "$ref" in reference
    ? openApi.components.parameters[reference.$ref.split("/").at(-1)]
    : reference)
  .find((parameter) => parameter.name === "X-Workspace-User-Token");
assert.equal(userTokenParameter?.in, "header", "Dify must send the short-lived Workspace user token in a header, never a URL");
assert.equal(userTokenParameter?.required, true, "Workspace read must require the user-scoped agent token");
const readViewParameter = readOperation.parameters
  .map((reference) => typeof reference === "object" && "$ref" in reference
    ? openApi.components.parameters[reference.$ref.split("/").at(-1)]
    : reference)
  .find((parameter) => parameter.name === "view");
assert.equal(readViewParameter?.in, "query", "Workspace read detail level must be a query parameter");
assert.deepEqual(readViewParameter?.schema?.enum, ["summary", "full"], "Workspace read must expose summary and full views");
assert.equal(readViewParameter?.schema?.default, "summary", "Workspace read must default to the token-efficient summary");
assert.ok(openApi.components.schemas.WorkspaceReadResponse.required.includes("blocks"), "Workspace read response must document top-level blocks");
assert.ok(!openApi.components.schemas.WorkspaceReadResponse.required.includes("board"), "Workspace read response must match its top-level runtime payload");
const actionItemType = openApi.components.schemas.WorkspaceActionItem.properties.type;
assert.equal(actionItemType.enum, undefined, "OpenAPI must route command names through workspace_capabilities instead of inlining the registry");
assert.equal(openApi.components.schemas.WorkspaceActionRequest.properties.action.enum, undefined, "OpenAPI must not inline the legacy command registry");
assert.equal(
  openApi.paths["/api/workspaces/{workspace_id}/agent/capabilities"].post.operationId,
  "workspace_capabilities",
  "OpenAPI capability operation is missing or has the wrong operationId",
);
assert.ok(
  openApi.components.schemas.WorkspaceCapabilitiesRequest,
  "OpenAPI capability request schema is missing",
);
const capabilityCategories = openApi.components.schemas.WorkspaceCapabilitiesRequest
  .properties.categories.items.enum;
const registeredCategories = [...new Set(registry.commands.map((command) => command.category))];
assert.deepEqual(
  new Set(capabilityCategories),
  new Set(registeredCategories),
  "OpenAPI capability category enum must match the categories used by the command registry",
);
assert.ok(
  openApi.components.schemas.WorkspaceCapabilitiesResponse,
  "OpenAPI capability response schema is missing",
);
assert.ok(openApi.components.schemas.WorkspaceActionItem.properties.style, "Workspace action items must expose the nested style patch");
assert.deepEqual(openApi.components.schemas.WorkspaceActionItem.properties.placement.enum, ["left", "right", "above", "below"], "Relative placement directions must stay explicit in the Custom Tool contract");
assert.ok(openApi.components.schemas.WorkspaceActionItem.properties.relativeToBlockId, "Relative placement must require an exact reference block ID");
assert.equal(openApi.components.schemas.WorkspaceActionRequest.properties.style, undefined, "Style must be nested inside each workspace action item");
assert.ok(/find with query/.test(openApi.components.schemas.WorkspaceActionRequest.properties.action.description), "Workspace action must document compact read-only target search");
assert.ok(openApi.components.schemas.WorkspaceActionResponse.properties.matches, "Workspace action response must document compact find results");
assert.ok(openApi.components.schemas.WorkspaceActionResponse.properties.result.properties.changedFrames, "Workspace mutation receipt must document changed presentation frames");
const workflow = read("workspace-agent-company-all-models-with-evidence.yml");
assert.ok(workflow.includes(`Command registry contract: version ${registry.version}.`), "Persisted Dify workflow is missing the current registry version marker");
assert.ok(
  workflow.includes("reopen_comment to reopen a resolved comment"),
  "Persisted Dify workflow must distinguish reopening a comment from resolving it",
);

console.log(JSON.stringify({
  registryVersion: registry.version,
  registered: names.length,
  difyActionItems: "capability-routed",
  status: "ok",
}));
