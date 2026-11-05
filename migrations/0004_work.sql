-- Live office. Poses stay on the hired person. Lines are the talk with the lead.
CREATE TABLE work_desk (
  person_id TEXT PRIMARY KEY,
  pose TEXT NOT NULL,
  label TEXT NOT NULL,
  task TEXT,
  note TEXT,
  updated_at INTEGER NOT NULL,
  CHECK (pose IN ('idle', 'arrive', 'think', 'read', 'type', 'run', 'wait', 'handoff', 'report', 'done', 'error')),
  CHECK (length(label) BETWEEN 1 AND 16)
);

CREATE TABLE work_line (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'lead')),
  text TEXT NOT NULL,
  raw TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX work_line_created ON work_line (created_at);
