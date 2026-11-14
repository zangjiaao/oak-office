-- One minute is short enough to try a reminder without waiting half an hour.
CREATE TABLE water_reminder_v2 (
  email TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  every_ms INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (every_ms BETWEEN 60000 AND 7200000)
);

INSERT INTO water_reminder_v2 (email, department_id, every_ms, next_at, updated_at)
SELECT email, department_id, every_ms, next_at, updated_at FROM water_reminder;

DROP TABLE water_reminder;
ALTER TABLE water_reminder_v2 RENAME TO water_reminder;
