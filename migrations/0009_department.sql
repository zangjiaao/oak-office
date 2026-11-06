-- A floor of the building. One department, one lead, one chat.
CREATE TABLE department (
  id TEXT PRIMARY KEY,
  floor INTEGER NOT NULL,
  name TEXT NOT NULL,
  rules TEXT NOT NULL DEFAULT '',
  seats INTEGER NOT NULL DEFAULT 8,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (floor >= 1 AND floor <= 99),
  CHECK (length(trim(name)) BETWEEN 1 AND 16),
  CHECK (length(rules) <= 8000),
  CHECK (seats >= 1 AND seats <= 8)
);

CREATE UNIQUE INDEX department_floor ON department (floor);

INSERT INTO department (id, floor, name, rules, seats, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-000000000001', 1, '交付组', '', 8, 0, 0);

ALTER TABLE people ADD COLUMN department_id TEXT NOT NULL DEFAULT 'a0000000-0000-4000-8000-000000000001';

DROP INDEX people_one_lead;
CREATE UNIQUE INDEX people_one_lead ON people (department_id) WHERE is_lead = 1;

DROP INDEX people_seat;
CREATE UNIQUE INDEX people_seat ON people (department_id, seat) WHERE seat IS NOT NULL;

ALTER TABLE work_line ADD COLUMN department_id TEXT NOT NULL DEFAULT 'a0000000-0000-4000-8000-000000000001';
CREATE INDEX work_line_department ON work_line (department_id, created_at);
