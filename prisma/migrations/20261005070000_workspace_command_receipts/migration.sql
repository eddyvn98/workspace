-- Receipt and board content are committed in the same transaction.
CREATE TABLE "workspace_command_receipts" (
  "board_id" TEXT NOT NULL REFERENCES "workspace_boards"("id") ON DELETE CASCADE,
  "actor_email" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("board_id", "actor_email", "request_id")
);

CREATE INDEX "workspace_command_receipts_board_time"
  ON "workspace_command_receipts" ("board_id", "created_at");

CREATE TABLE workspace_agent_turns (
  board_id TEXT NOT NULL REFERENCES workspace_boards(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
  response JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, actor_email, turn_id)
);
CREATE INDEX workspace_agent_turns_board_time
  ON workspace_agent_turns(board_id, created_at);
