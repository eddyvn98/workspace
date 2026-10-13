import type { WorkspaceRuntimeActionType } from "./actionSchema";

export const WORKSPACE_RUNTIME_MAX_ROUNDS = 5;
export const WORKSPACE_RUNTIME_MAX_ACTIONS = 12;
export const WORKSPACE_RUNTIME_DEADLINE_MS = 45_000;
export type WorkspaceRuntimeStatus = "completed" | "partial" | "failed";
export type WorkspaceJson = Record<string, unknown>;

export type WorkspaceTurnProgressEvent = {
  sequence: number;
  phase: "model_step" | "executing" | "persisted" | "completed";
  round?: number;
  persistedCount?: number;
  revision?: number;
};

export type WorkspaceTurnProgressInput = Omit<WorkspaceTurnProgressEvent, "sequence">;

export interface WorkspaceRuntimeRequest {
  boardId: string;
  turnId: string;
  query: string;
  context?: string;
  modelSelector: string;
  conversationId?: string | null;
  authorization: string;
  workspaceUserToken: string;
  actorEmail?: string;
  canMutate: boolean;
  signal: AbortSignal;
}

export interface WorkspaceModelProposal {
  done: boolean;
  message: string;
  actions: WorkspaceJson[];
}

export interface WorkspaceRuntimeReceipt {
  requestId: string;
  actionType: WorkspaceRuntimeActionType;
  targetIds: string[];
  persisted: boolean;
  revisionBefore: number;
  revisionAfter: number | null;
  summary?: string;
  reason?: string;
}

export interface WorkspaceRuntimeResult {
  answer: string;
  turnId: string;
  conversationId: string | null;
  rounds: number;
  status: WorkspaceRuntimeStatus;
  receipts: WorkspaceRuntimeReceipt[];
  appliedSummaries: string[];
  unresolvedSummaries: string[];
  focusBlockIds: string[];
}

export interface WorkspaceBoardSnapshot extends WorkspaceJson {
  revision: number;
  title: string;
  blocks: unknown;
  blockOrder: unknown;
  connectors: unknown;
}

export interface WorkspaceModelProposalRequest {
  boardId: string;
  turnId: string;
  round: number;
  modelSelector: string;
  workspaceUserToken: string;
  actorEmail?: string;
  query: string;
  conversationId: string | null;
  signal: AbortSignal;
}

export interface WorkspaceModelProposalResponse {
  answer: string;
  conversationId: string | null;
}

export interface WorkspaceRuntimeModelProvider {
  propose(input: WorkspaceModelProposalRequest): Promise<WorkspaceModelProposalResponse>;
}
