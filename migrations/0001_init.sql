PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, equipment TEXT NOT NULL,
  primary_muscles TEXT NOT NULL DEFAULT '[]', secondary_muscles TEXT NOT NULL DEFAULT '[]',
  default_step REAL NOT NULL DEFAULT 2.5, image_path TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workout_templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS template_exercises (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES workout_templates(id),
  exercise_id TEXT NOT NULL REFERENCES exercises(id), order_index INTEGER NOT NULL,
  rest_seconds INTEGER NOT NULL DEFAULT 90, notes TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS template_sets (
  id TEXT PRIMARY KEY, template_exercise_id TEXT NOT NULL REFERENCES template_exercises(id),
  set_index INTEGER NOT NULL, target_load REAL, target_reps INTEGER, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY, template_id TEXT, name TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER, notes TEXT,
  updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS session_exercises (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES workout_sessions(id),
  exercise_id TEXT NOT NULL, name_snapshot TEXT NOT NULL, order_index INTEGER NOT NULL,
  rest_seconds INTEGER NOT NULL, notes TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS session_sets (
  id TEXT PRIMARY KEY, session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id),
  set_index INTEGER NOT NULL, planned_load REAL, planned_reps INTEGER, previous_load REAL,
  previous_reps INTEGER, actual_load REAL, actual_reps INTEGER, is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS body_measurements (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
  measured_at TEXT NOT NULL, note TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sync_changes (
  id TEXT PRIMARY KEY, table_name TEXT NOT NULL, record_id TEXT NOT NULL,
  record_json TEXT NOT NULL, changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_template_sets_exercise ON template_sets(template_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON workout_sessions(status, started_at);
CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_session_sets_exercise ON session_sets(session_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_measurements_type_date ON body_measurements(type, measured_at);
CREATE INDEX IF NOT EXISTS idx_sync_changed_at ON sync_changes(changed_at);
