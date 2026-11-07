-- One-off tasks on a floor's wall board. Recurring work stays in duty.
CREATE TABLE board_task (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  title TEXT NOT NULL,
  person_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('open', 'doing', 'done')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(trim(title)) BETWEEN 1 AND 80)
);

CREATE INDEX board_task_department ON board_task (department_id, created_at);
