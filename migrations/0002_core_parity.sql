ALTER TABLE exercises ADD COLUMN family_id TEXT;
ALTER TABLE exercises ADD COLUMN family_name TEXT;
ALTER TABLE exercises ADD COLUMN movement_class TEXT;
ALTER TABLE exercises ADD COLUMN image_thumb_path TEXT;
ALTER TABLE exercises ADD COLUMN image_full_path TEXT;

CREATE TABLE IF NOT EXISTS session_runtime (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  rest_timer_ends_at TEXT,
  active_exercise_id TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_runtime_session ON session_runtime(session_id);
CREATE INDEX IF NOT EXISTS idx_sync_changed_at_id ON sync_changes(changed_at, id);

UPDATE body_measurements SET type = 'arm_right' WHERE type = 'arm';
