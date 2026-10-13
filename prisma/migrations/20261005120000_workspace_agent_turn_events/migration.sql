CREATE TABLE workspace_agent_turn_events (
  board_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  phase TEXT NOT NULL CHECK (phase IN ('model_step', 'executing', 'persisted', 'completed')),
  round INTEGER CHECK (round IS NULL OR round > 0),
  persisted_count INTEGER CHECK (persisted_count IS NULL OR persisted_count >= 0),
  revision INTEGER CHECK (revision IS NULL OR revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, actor_email, turn_id, sequence),
  FOREIGN KEY (board_id, actor_email, turn_id)
    REFERENCES workspace_agent_turns(board_id, actor_email, turn_id)
    ON DELETE CASCADE
);
