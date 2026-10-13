import registry from "../config/workspace-command-registry.json";

export type WorkspaceCommandDefinition = (typeof registry.commands)[number];
export type WorkspaceCommandName = WorkspaceCommandDefinition["name"];

export const WORKSPACE_COMMAND_REGISTRY_VERSION = registry.version;
export const WORKSPACE_COMMAND_REGISTRY = registry.commands;
export const WORKSPACE_COMMAND_NAMES = WORKSPACE_COMMAND_REGISTRY.map((command) => command.name);
export const WORKSPACE_COMMAND_NAME_SET = new Set<string>(WORKSPACE_COMMAND_NAMES);

export function isWorkspaceCommandName(value: unknown): value is WorkspaceCommandName {
  return typeof value === "string" && WORKSPACE_COMMAND_NAME_SET.has(value);
}
