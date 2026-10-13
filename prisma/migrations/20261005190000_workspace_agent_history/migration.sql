CREATE TABLE workspace_agent_history (
  history_id BIGSERIAL PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES workspace_boards(id) ON DELETE CASCADE,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  undone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX workspace_agent_history_stack
  ON workspace_agent_history(board_id, undone, history_id);
