-- A drink reminder belongs to the person who set it, not to the whole office.
CREATE TABLE water_reminder (
  email TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  every_ms INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (every_ms BETWEEN 1800000 AND 7200000)
);

CREATE TABLE work_line_v4 (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'lead', 'staff', 'clock', 'water')),
  person_id TEXT,
  text TEXT NOT NULL,
  raw TEXT,
  created_at INTEGER NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'a0000000-0000-4000-8000-000000000001',
  author_email TEXT
);

INSERT INTO work_line_v4 (id, role, person_id, text, raw, created_at, department_id, author_email)
SELECT id, role, person_id, text, raw, created_at, department_id, author_email FROM work_line;

DROP TABLE work_line;
ALTER TABLE work_line_v4 RENAME TO work_line;
CREATE INDEX work_line_created ON work_line (created_at);
CREATE INDEX work_line_department ON work_line (department_id, created_at);
