CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  access_sub TEXT UNIQUE,
  last_login_method TEXT,
  invited_by TEXT REFERENCES app_users(id),
  created_at TEXT NOT NULL,
  first_login_at TEXT,
  last_login_at TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE workout_templates ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE template_exercises ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE template_sets ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE workout_sessions ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE session_exercises ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE session_sets ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE session_runtime ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE body_measurements ADD COLUMN user_id TEXT REFERENCES app_users(id);
ALTER TABLE sync_changes ADD COLUMN user_id TEXT REFERENCES app_users(id);

CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status, email_normalized);
CREATE INDEX IF NOT EXISTS idx_templates_user ON workout_templates(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_template_exercises_user ON template_exercises(user_id, template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_template_sets_user ON template_sets(user_id, template_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON workout_sessions(user_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_session_exercises_user ON session_exercises(user_id, session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_session_sets_user ON session_sets(user_id, session_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_session_runtime_user ON session_runtime(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_measurements_user ON body_measurements(user_id, type, measured_at);
CREATE INDEX IF NOT EXISTS idx_sync_user_cursor ON sync_changes(user_id, changed_at, id);
