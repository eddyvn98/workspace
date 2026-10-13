export type WorkspaceChatMode = "dify";

export interface WorkspaceChatModeOption {
  value: WorkspaceChatMode;
  label: string;
  description: string;
}

export const WORKSPACE_CHAT_MODES: WorkspaceChatModeOption[] = [
  { value: "dify", label: "Dify", description: "Workspace workflow with custom tools" },
];
