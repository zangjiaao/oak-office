-- Staff replies stay in the transcript, separate from the lead's summary.
CREATE TABLE work_line_v2 (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'lead', 'staff')),
  person_id TEXT,
  text TEXT NOT NULL,
  raw TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO work_line_v2 (id, role, person_id, text, raw, created_at)
SELECT id, role, NULL, text, raw, created_at FROM work_line;

DROP TABLE work_line;
ALTER TABLE work_line_v2 RENAME TO work_line;
CREATE INDEX work_line_created ON work_line (created_at);
