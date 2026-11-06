-- Recurring work the lead keeps, for themselves or for one employee.
CREATE TABLE duty (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  task TEXT NOT NULL,
  every_ms INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX duty_next ON duty (next_at);

-- A clock line is a scheduled turn, separate from something the user just typed.
CREATE TABLE work_line_v3 (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'lead', 'staff', 'clock')),
  person_id TEXT,
  text TEXT NOT NULL,
  raw TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO work_line_v3 (id, role, person_id, text, raw, created_at)
SELECT id, role, person_id, text, raw, created_at FROM work_line;

DROP TABLE work_line;
ALTER TABLE work_line_v3 RENAME TO work_line;
CREATE INDEX work_line_created ON work_line (created_at);
