-- Commands a person has run in the shared workspace. The files stay where they are.
CREATE TABLE shell_run (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  command TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX shell_run_person ON shell_run (person_id, started_at);
