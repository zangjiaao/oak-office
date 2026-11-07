-- Compressed prefix of a floor's dialogue. The original lines stay in work_line.
CREATE TABLE work_compact (
  department_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  first_kept_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
