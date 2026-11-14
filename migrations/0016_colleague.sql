-- Humans who use the office, named by the email Cloudflare Access already checked.
CREATE TABLE colleague (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (length(trim(name)) BETWEEN 1 AND 16)
);

ALTER TABLE work_line ADD COLUMN author_email TEXT;
